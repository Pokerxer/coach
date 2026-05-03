'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSessionStore } from '@/store/session';
import { useTranscription } from './useTranscription';
import { useRouter } from 'next/navigation';
import { TranscriptLine } from '@/types';
import toast from 'react-hot-toast';

const isElectron = () =>
  typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

// Best OPUS/WebM MIME — 5-10× smaller than WAV, natively supported by Groq
const OPUS_MIME =
  typeof window !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSession(sessionId: string) {
  const router = useRouter();
  const {
    setIsRecording, setIsMuted, isMuted,
    setStartedAt, setSessionId,
    addTranscriptLine, setInterimText,
  } = useSessionStore();
  const { generateAnswer, checkAndAnswer } = useTranscription();

  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Browser (Web Speech API)
  const recognitionRef  = useRef<any>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Electron (MediaRecorder + AnalyserNode VAD + Groq)
  const streamRef         = useRef<MediaStream | null>(null);
  const audioCtxRef       = useRef<AudioContext | null>(null);
  const analyserRef       = useRef<AnalyserNode | null>(null);
  const recorderRef       = useRef<MediaRecorder | null>(null);
  const vadIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const isSpeakingRef     = useRef(false);
  const silenceCountRef   = useRef(0);
  const processingRef     = useRef(false);
  const lastLineRef       = useRef('');
  const pendingBlobRef    = useRef<Blob | null>(null);

  // ── Groq transcription ─────────────────────────────────────────────────────
  const processBlob = useCallback(async (blob: Blob, attempt = 0) => {
    if (!useSessionStore.getState().isRecording) return;
    processingRef.current = true;
    setInterimText('transcribing…');
    try {
      const form = new FormData();
      form.append('audio', blob, 'chunk.webm');

      const recentLines = useSessionStore.getState().transcript
        .slice(-3).map(l => l.text).join(' ');
      if (recentLines) form.append('prompt', recentLines);

      let res: Response;
      try {
        res = await fetch('/api/transcribe', {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(15_000),
        });
      } catch (fetchErr: any) {
        // ECONNRESET / network blip — retry up to 2 times with backoff
        const isRetryable = fetchErr?.name === 'TimeoutError' ||
          fetchErr?.cause?.code === 'ECONNRESET' ||
          fetchErr?.cause?.code === 'ECONNREFUSED';
        if (isRetryable && attempt < 2) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          return processBlob(blob, attempt + 1);
        }
        console.error('[transcribe] fetch failed:', fetchErr?.cause?.code ?? fetchErr);
        return;
      }

      if (!res.ok) {
        if (res.status === 500) toast.error('Transcription error — check your Groq API key');
        return;
      }

      const { text, error } = await res.json();
      if (error) { console.error('[transcribe]', error); return; }

      const trimmed = (text as string)?.trim();
      setInterimText('');
      if (!trimmed || trimmed.length < 3) return;

      if (/^(thank you\.?|thanks\.?|you\.?|\.+|bye\.?|goodbye\.?|okay\.?|ok\.?|um+\.?|uh+\.?|mm+\.?|hmm+\.?|\.{1,3}|the\.?|a\.?|i\.?)$/i.test(trimmed)) return;

      const norm     = trimmed.toLowerCase();
      const lastNorm = lastLineRef.current.toLowerCase();
      if (norm === lastNorm || (norm.length < 20 && lastNorm.includes(norm))) return;

      lastLineRef.current = trimmed;
      addTranscriptLine({ id: crypto.randomUUID(), text: trimmed, timestamp: Date.now() });

      if (useSessionStore.getState().setupData.autoDetect) {
        void checkAndAnswer(trimmed);
      }
    } catch (err) {
      console.error('[transcribe]', err);
      setInterimText('');
    } finally {
      processingRef.current = false;
      if (pendingBlobRef.current) {
        const next = pendingBlobRef.current;
        pendingBlobRef.current = null;
        processBlob(next);
      }
    }
  }, [addTranscriptLine, setInterimText, checkAndAnswer]);

  // ── Electron: AnalyserNode VAD + MediaRecorder (OPUS) ─────────────────────
  const startElectronSession = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { exact: true },
          noiseSuppression: { exact: true },
          autoGainControl: { exact: true },
          sampleRate: 48000,
          sampleSize: 16,
          channelCount: 1,
        },
        video: false,
      });
    } catch {
      alert('Microphone access denied. Open System Settings → Privacy & Security → Microphone.');
      return;
    }
    streamRef.current = stream;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;

    // Audio processing chain for better quality
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const gain = ctx.createGain();
    gain.gain.value = 1.5;

    // Connect: source → analyser (for VAD) → compressor → gain → destination
    source.connect(analyser);
    // Also connect to processing chain but don't connect to destination (we don't need playback)
    // Instead, create a MediaStreamDestination for recording
    const dest = ctx.createMediaStreamDestination();

    // For VAD we use the connected analyser
    // The processed stream goes to dest for recording
    const processedStream = dest.stream;

    // Connect for recording quality (not audible)
    source.connect(compressor).connect(gain).connect(dest);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const timeDomain = new Uint8Array(analyser.fftSize);

    const VAD_POLL_MS    = 80;
    const SPEECH_LEVEL   = 15;   // uint8 RMS deviation from 128 — slightly lower catches softer speech
    const SILENCE_FRAMES = 24;   // 19 × 80ms = 1520ms silence → utterance ends
    const MIN_SPEECH_MS  = 300;  // ignore blips under 300ms
    const MAX_SPEECH_MS  = 25_000;
    let   speechStartMs = 0;

    const startRec = () => {
      if (recorderRef.current) return;
      chunksRef.current = [];
      const rec = new MediaRecorder(processedStream, { mimeType: OPUS_MIME });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: OPUS_MIME });
        chunksRef.current = [];
        if (blob.size < 1000) return;
        if (processingRef.current) { pendingBlobRef.current = blob; }
        else { processBlob(blob); }
      };
      rec.start();
      recorderRef.current = rec;
      speechStartMs = Date.now();
    };

    const stopRec = () => {
      if (!recorderRef.current) return;
      try { recorderRef.current.stop(); } catch {}
      recorderRef.current = null;
    };

    const discardRec = () => {
      if (!recorderRef.current) return;
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      try { recorderRef.current.stop(); } catch {}
      recorderRef.current = null;
      chunksRef.current = [];
    };

    vadIntervalRef.current = setInterval(() => {
      if (isMutedRef.current || !useSessionStore.getState().isRecording) return;
      analyser.getByteTimeDomainData(timeDomain);
      let sum = 0;
      for (let i = 0; i < timeDomain.length; i++) { const d = timeDomain[i] - 128; sum += d * d; }
      const level = Math.sqrt(sum / timeDomain.length);

      if (level > SPEECH_LEVEL) {
        if (!isSpeakingRef.current) { isSpeakingRef.current = true; startRec(); }
        silenceCountRef.current = 0;
        if (recorderRef.current && Date.now() - speechStartMs > MAX_SPEECH_MS) {
          isSpeakingRef.current = false; silenceCountRef.current = 0; stopRec();
        }
      } else if (isSpeakingRef.current) {
        if (++silenceCountRef.current >= SILENCE_FRAMES) {
          isSpeakingRef.current = false;
          silenceCountRef.current = 0;
          if (Date.now() - speechStartMs < MIN_SPEECH_MS) discardRec();
          else stopRec();
        }
      }
    }, VAD_POLL_MS);

    const resumeCtx = () => { if (ctx.state === 'suspended') ctx.resume(); };
    document.addEventListener('visibilitychange', resumeCtx);
    (ctx as any)._cleanup = () => document.removeEventListener('visibilitychange', resumeCtx);

    setIsRecording(true);
  }, [setIsRecording, processBlob]);

  const stopElectronSession = useCallback(async () => {
    (audioCtxRef.current as any)?._cleanup?.();
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    if (recorderRef.current) { try { recorderRef.current.stop(); } catch {} recorderRef.current = null; }
    analyserRef.current = null;
    audioCtxRef.current?.close(); audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
    chunksRef.current = []; isSpeakingRef.current = false;
    silenceCountRef.current = 0; processingRef.current = false;
    lastLineRef.current = ''; pendingBlobRef.current = null;
    setInterimText(''); setIsRecording(false);
    await fetch(`/api/sessions/${sessionId}/end`, { method: 'PATCH' });
    router.push(`/session/${sessionId}/summary`);
  }, [sessionId, setIsRecording, setInterimText, router]);

  const toggleMuteElectron = useCallback(() => {
    const muted = !isMutedRef.current;
    isMutedRef.current = muted;
    setIsMuted(muted);
    streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !muted; });
    if (muted) {
      setInterimText('');
      if (recorderRef.current) {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onstop = null;
        try { recorderRef.current.stop(); } catch {}
        recorderRef.current = null;
      }
      chunksRef.current = []; isSpeakingRef.current = false;
      silenceCountRef.current = 0; pendingBlobRef.current = null;
    }
  }, [setIsMuted, setInterimText]);

  // ── Browser: Web Speech API (Chrome / Edge) ────────────────────────────────
  const scheduleRestart = useCallback((delay = 250) => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      if (!useSessionStore.getState().isRecording || isMutedRef.current) return;
      try { recognitionRef.current?.start(); } catch {}
    }, delay);
  }, []);

  const startBrowserSession = useCallback(async () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported. Use Chrome or Edge.'); return; }

    const recognition           = new SR();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;
    recognition.lang            = 'en-US';

    recognition.onresult = async (event: any) => {
      if (isMutedRef.current) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text   = result[0].transcript;
        if (result.isFinal) {
          const trimmed = text.trim();
          if (!trimmed) continue;
          setInterimText('');
          addTranscriptLine({ id: crypto.randomUUID(), text: trimmed, timestamp: Date.now() });
          if (useSessionStore.getState().setupData.autoDetect) await checkAndAnswer(trimmed);
        } else { interim += text; }
      }
      if (interim) setInterimText(interim);
    };

    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'network')       { scheduleRestart(2000); return; }
      if (e.error === 'audio-capture') { scheduleRestart(1000); return; }
      console.error('[speech]', e.error);
    };
    recognition.onend = () => { setInterimText(''); if (!isMutedRef.current) scheduleRestart(); };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [setIsRecording, addTranscriptLine, setInterimText, checkAndAnswer, scheduleRestart]);

  const stopBrowserSession = useCallback(async () => {
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    recognitionRef.current?.stop(); recognitionRef.current = null;
    setInterimText(''); setIsRecording(false);
    await fetch(`/api/sessions/${sessionId}/end`, { method: 'PATCH' });
    router.push(`/session/${sessionId}/summary`);
  }, [sessionId, setIsRecording, setInterimText, router]);

  const toggleMuteBrowser = useCallback(() => {
    const muted = !isMutedRef.current;
    isMutedRef.current = muted;
    setIsMuted(muted);
    if (muted) { setInterimText(''); recognitionRef.current?.stop(); }
    else if (useSessionStore.getState().isRecording) scheduleRestart(100);
  }, [setIsMuted, setInterimText, scheduleRestart]);

  // ── Unified API ────────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setSessionId(sessionId); setStartedAt(Date.now());
    if (isElectron()) await startElectronSession();
    else              await startBrowserSession();
  }, [sessionId, setSessionId, setStartedAt, startElectronSession, startBrowserSession]);

  const stopSession = useCallback(async () => {
    if (isElectron()) await stopElectronSession();
    else              await stopBrowserSession();
  }, [stopElectronSession, stopBrowserSession]);

  const toggleMute = useCallback(() => {
    if (isElectron()) toggleMuteElectron();
    else              toggleMuteBrowser();
  }, [toggleMuteElectron, toggleMuteBrowser]);

  const triggerManual = useCallback(async () => {
    const { transcript, interimText } = useSessionStore.getState();
    if (transcript.length === 0 && !interimText) return;
    const recent = transcript.slice(-4).map(l => l.text);
    if (interimText) recent.push(interimText);
    await generateAnswer(recent.join(' ').trim());
  }, [generateAnswer]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as Element)?.tagName;
      if (e.code === 'Space' && !['INPUT','TEXTAREA'].includes(tag)) { e.preventDefault(); triggerManual(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') { e.preventDefault(); toggleMute(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); stopSession(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [triggerManual, toggleMute, stopSession]);

  return { startSession, stopSession, toggleMute, triggerManual };
}

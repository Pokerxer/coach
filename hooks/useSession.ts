'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSessionStore } from '@/store/session';
import { useTranscription } from './useTranscription';
import { useRouter } from 'next/navigation';
import { TranscriptLine } from '@/types';

const isElectron = () =>
  typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

// ─── WAV encoder ─────────────────────────────────────────────────────────────
// Encodes raw float32 PCM → a valid WAV Blob that Groq always accepts.
// We do this manually instead of relying on MediaRecorder codecs, which
// invoke macOS VideoToolbox and produce broken files in Electron.

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v   = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0,  'RIFF');
  v.setUint32( 4, 36 + samples.length * 2, true);
  str(8,  'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16,           true); // PCM chunk size
  v.setUint16(20,  1,           true); // PCM format
  v.setUint16(22,  1,           true); // mono
  v.setUint32(24, sampleRate,   true);
  v.setUint32(28, sampleRate*2, true); // byte rate
  v.setUint16(32,  2,           true); // block align
  v.setUint16(34, 16,           true); // bits per sample
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// Fast linear resampler — avoids async OfflineAudioContext overhead (~50ms → ~2ms)
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio  = fromRate / toRate;
  const outLen = Math.round(input.length / ratio);
  const output = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos   = i * ratio;
    const idx   = Math.floor(pos);
    const frac  = pos - idx;
    const a     = input[idx] ?? 0;
    const b     = input[Math.min(idx + 1, input.length - 1)] ?? 0;
    output[i]   = a + frac * (b - a); // linear interpolation
  }
  return output;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSession(sessionId: string) {
  const router = useRouter();
  const { setIsRecording, setIsMuted, isMuted, setStartedAt, setSessionId, addTranscriptLine, setInterimText } =
    useSessionStore();
  const { generateAnswer, checkAndAnswer } = useTranscription();

  const isMutedRef      = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Browser path
  const recognitionRef  = useRef<any>(null);

  // Electron path
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const processorRef    = useRef<ScriptProcessorNode | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const samplesRef      = useRef<Float32Array[]>([]);
  const sampleCountRef  = useRef(0);
  const processingRef    = useRef(false);
  const isSpeakingRef    = useRef(false);
  const silenceFramesRef = useRef(0);
  const lastLineRef      = useRef('');
  const preBufRef        = useRef<Float32Array[]>([]);   // rolling look-back so first syllables aren't missed
  const pendingQueueRef  = useRef<Float32Array[]>([]);   // queue of utterances waiting while Groq is busy
  const sampleRateRef   = useRef(44100);

  // ── Electron path ──────────────────────────────────────────────────────────
  const startElectronSession = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      alert('Microphone access denied. Open System Settings → Privacy & Security → Microphone and allow this app.');
      return;
    }

    streamRef.current = stream;

    const ctx  = new AudioContext();
    const RATE = ctx.sampleRate;          // 44100 or 48000
    sampleRateRef.current = RATE;

    // ── VAD thresholds ────────────────────────────────────────────────────────
    // Each ScriptProcessor callback = 4096 samples ≈ 93ms at 44100 Hz
    const FRAMES_PER_BUFFER   = 2048;                                  // smaller = lower latency (~46ms per frame)
    const BUFFER_MS           = (FRAMES_PER_BUFFER / RATE) * 1000;
    const SPEECH_GATE         = 0.012;   // RMS to trigger speech start
    const SILENCE_END_MS      = 320;     // ms of quiet → utterance is over (faster cutoff)
    const SILENCE_END_FRAMES  = Math.ceil(SILENCE_END_MS / BUFFER_MS);
    const MIN_SPEECH_MS       = 180;     // ignore blips shorter than this
    const MIN_SPEECH_FRAMES   = Math.ceil(MIN_SPEECH_MS / BUFFER_MS);
    const MAX_SPEECH_MS       = 15_000;  // hard cap: send after 15 s regardless
    const MAX_SPEECH_SAMPLES  = RATE * (MAX_SPEECH_MS / 1000);
    const PRE_BUF_FRAMES      = Math.ceil(200 / BUFFER_MS); // look-back for first syllables

    const source    = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(FRAMES_PER_BUFFER, 1, 1);

    audioCtxRef.current  = ctx;
    processorRef.current = processor;

    const processAudio = async (combined: Float32Array) => {
      processingRef.current = true;
      setInterimText('transcribing…');
      try {
        const TARGET_RATE = 16000;
        const audio = resample(combined, RATE, TARGET_RATE);
        const wav   = encodeWAV(audio, TARGET_RATE);
        const form  = new FormData();
        form.append('audio', wav, 'chunk.wav');

        const res = await fetch('/api/transcribe', { method: 'POST', body: form });
        if (!res.ok) return;

        const { text } = await res.json();
        const trimmed  = (text as string)?.trim();
        setInterimText('');

        if (!trimmed || trimmed.length < 3) return;

        // Hallucination filter — whisper artifacts on silence/noise
        const HALLUCINATIONS = /^(thank you\.?|thanks\.?|you\.?|\.+|bye\.?|goodbye\.?|okay\.?|ok\.?|um+\.?|uh+\.?|mm+\.?|hmm+\.?|\.{1,3}|the\.?|a\.?|i\.?)$/i;
        if (HALLUCINATIONS.test(trimmed)) return;

        // Dedup: skip if identical to last line
        if (trimmed.toLowerCase() === lastLineRef.current.toLowerCase()) return;

        if (useSessionStore.getState().isRecording) {
          lastLineRef.current = trimmed;
          const line: TranscriptLine = { id: crypto.randomUUID(), text: trimmed, timestamp: Date.now() };
          addTranscriptLine(line);
          if (useSessionStore.getState().setupData.autoDetect) {
            void checkAndAnswer(trimmed); // fire-and-forget — never await inside audio callback
          }
        }
      } catch (err) {
        console.error('[transcribe]', err);
        setInterimText('');
      } finally {
        processingRef.current = false;
        // Drain queue — process next utterance if any accumulated while busy
        if (pendingQueueRef.current.length > 0) {
          // Keep only the most recent if queue grew long (stale audio is useless)
          const next = pendingQueueRef.current[pendingQueueRef.current.length - 1];
          pendingQueueRef.current = [];
          processAudio(next);
        }
      }
    };

    const sendUtterance = () => {
      const chunks = samplesRef.current;
      const total  = sampleCountRef.current;
      samplesRef.current   = [];
      sampleCountRef.current = 0;

      if (total < MIN_SPEECH_FRAMES * FRAMES_PER_BUFFER) return; // too short to be speech

      const combined = new Float32Array(total);
      let off = 0;
      for (const c of chunks) { combined.set(c, off); off += c.length; }

      // Speech-density gate
      const DENSITY_FRAME = 512;
      let speechFrames = 0;
      const totalFrames = Math.floor(combined.length / DENSITY_FRAME);
      for (let i = 0; i < totalFrames; i++) {
        if (rms(combined.subarray(i * DENSITY_FRAME, (i + 1) * DENSITY_FRAME)) > SPEECH_GATE * 0.6) speechFrames++;
      }
      if (totalFrames > 0 && speechFrames / totalFrames < 0.18) return;

      if (processingRef.current) {
        pendingQueueRef.current.push(combined); // queue — drained after current finishes
      } else {
        processAudio(combined);
      }
    };

    processor.onaudioprocess = (e) => {
      if (isMutedRef.current || !useSessionStore.getState().isRecording) return;

      const input = new Float32Array(e.inputBuffer.getChannelData(0));
      const level = rms(input);

      // Always maintain a rolling pre-buffer so we can prepend it when speech starts
      // (captures the first syllables that arrive before energy crosses SPEECH_GATE)
      if (!isSpeakingRef.current) {
        preBufRef.current.push(new Float32Array(input));
        if (preBufRef.current.length > PRE_BUF_FRAMES) preBufRef.current.shift();
      }

      if (level > SPEECH_GATE) {
        // ── Speech detected ────────────────────────────────────────────────
        if (!isSpeakingRef.current) {
          // Flush pre-buffer into the utterance so opening syllables are included
          for (const frame of preBufRef.current) {
            samplesRef.current.push(frame);
            sampleCountRef.current += frame.length;
          }
          preBufRef.current = [];
        }
        isSpeakingRef.current    = true;
        silenceFramesRef.current = 0;
        samplesRef.current.push(input);
        sampleCountRef.current += input.length;

        // Hard cap: send if utterance has gone on too long
        if (sampleCountRef.current >= MAX_SPEECH_SAMPLES) {
          isSpeakingRef.current    = false;
          silenceFramesRef.current = 0;
          sendUtterance();
        }
      } else if (isSpeakingRef.current) {
        // ── Trailing silence after speech ──────────────────────────────────
        // Keep recording (captures natural pauses mid-sentence)
        samplesRef.current.push(input);
        sampleCountRef.current += input.length;
        silenceFramesRef.current++;

        if (silenceFramesRef.current >= SILENCE_END_FRAMES) {
          // Silence long enough → utterance ended
          isSpeakingRef.current    = false;
          silenceFramesRef.current = 0;
          sendUtterance();
        }
      }
      // If not speaking and level < SPEECH_GATE: discard frame entirely
    };

    source.connect(processor);
    processor.connect(ctx.destination);

    // Resume AudioContext if the browser suspends it (tab visibility change, etc.)
    const resumeCtx = () => { if (ctx.state === 'suspended') ctx.resume(); };
    document.addEventListener('visibilitychange', resumeCtx);
    document.addEventListener('click', resumeCtx, { once: true });
    // Store cleanup on the ctx so stopElectronSession can remove it
    (ctx as any)._cleanup = () => document.removeEventListener('visibilitychange', resumeCtx);

    setIsRecording(true);
  }, [setIsRecording, addTranscriptLine, setInterimText, checkAndAnswer]);

  const stopElectronSession = useCallback(async () => {
    (audioCtxRef.current as any)?._cleanup?.();
    processorRef.current?.disconnect();
    processorRef.current   = null;
    audioCtxRef.current?.close();
    audioCtxRef.current    = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current      = null;
    samplesRef.current       = [];
    sampleCountRef.current   = 0;
    processingRef.current    = false;
    isSpeakingRef.current    = false;
    silenceFramesRef.current = 0;
    lastLineRef.current      = '';
    preBufRef.current        = [];
    pendingQueueRef.current  = [];
    setInterimText('');
    setIsRecording(false);
    await fetch(`/api/sessions/${sessionId}/end`, { method: 'PATCH' });
    router.push(`/session/${sessionId}/summary`);
  }, [sessionId, setIsRecording, setInterimText, router]);

  const toggleMuteElectron = useCallback(() => {
    const muted = !isMutedRef.current;
    isMutedRef.current = muted;
    setIsMuted(muted);
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    if (muted) {
      setInterimText('');
      samplesRef.current       = [];
      sampleCountRef.current   = 0;
      isSpeakingRef.current    = false;
      silenceFramesRef.current = 0;
      preBufRef.current        = [];
      pendingQueueRef.current  = [];
    }
  }, [setIsMuted, setInterimText]);

  // ── Browser path: webkitSpeechRecognition (Chrome / Safari) ──────────────
  const startBrowserSession = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported. Use Chrome or Safari.'); return; }

    const recognition        = new SR();
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
          const line: TranscriptLine = { id: crypto.randomUUID(), text: trimmed, timestamp: Date.now() };
          addTranscriptLine(line);
          if (useSessionStore.getState().setupData.autoDetect) await checkAndAnswer(trimmed);
        } else {
          interim += text;
        }
      }
      if (interim) setInterimText(interim);
    };

    const tryRestart = (delay = 300) => {
      setTimeout(() => {
        if (useSessionStore.getState().isRecording && !isMutedRef.current) {
          try { recognition.start(); } catch {}
        }
      }, delay);
    };

    recognition.onerror = (e: any) => {
      // 'no-speech' and 'aborted' are normal — browser auto-fires onend, which restarts
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'network') { tryRestart(2000); return; }
      if (e.error === 'audio-capture') { tryRestart(1000); return; }
      console.error('[speech]', e.error);
    };

    recognition.onend = () => tryRestart();

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [setIsRecording, addTranscriptLine, setInterimText, checkAndAnswer]);

  const stopBrowserSession = useCallback(async () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setInterimText('');
    setIsRecording(false);
    await fetch(`/api/sessions/${sessionId}/end`, { method: 'PATCH' });
    router.push(`/session/${sessionId}/summary`);
  }, [sessionId, setIsRecording, setInterimText, router]);

  const toggleMuteBrowser = useCallback(() => {
    const muted = !isMutedRef.current;
    isMutedRef.current = muted;
    setIsMuted(muted);
    if (muted) { setInterimText(''); recognitionRef.current?.stop(); }
    else if (recognitionRef.current && useSessionStore.getState().isRecording) {
      try { recognitionRef.current.start(); } catch {}
    }
  }, [setIsMuted, setInterimText]);

  // ── Unified API ────────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setSessionId(sessionId);
    setStartedAt(Date.now());
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
    const recent = transcript.slice(-4).map((l) => l.text);
    if (interimText) recent.push(interimText);
    await generateAnswer(recent.join(' ').trim());
  }, [generateAnswer]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as Element)?.tagName)) {
        e.preventDefault(); triggerManual();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') { e.preventDefault(); toggleMute(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); stopSession(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [triggerManual, toggleMute, stopSession]);

  return { startSession, stopSession, toggleMute, triggerManual };
}

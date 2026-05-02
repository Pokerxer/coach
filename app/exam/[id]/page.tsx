'use client';

import { use, useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/store/session';
import { StealthModeWrapper } from '@/components/session/StealthMode';
import { Button } from '@/components/ui/button';
import { Camera, Square, RefreshCw, Loader2, BookOpen, Clock, ToggleLeft, ToggleRight, Monitor, X, PictureInPicture2 } from 'lucide-react';

// ── Exam PiP: floating answer window that stays on top of other tabs ──────────
function useExamPiP() {
  const pipRef = useRef<any>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const openPiP = useCallback(async () => {
    if (!('documentPictureInPicture' in window)) {
      alert('Picture-in-Picture requires Chrome 116+');
      return;
    }
    if (pipRef.current) { try { pipRef.current.close(); } catch {} pipRef.current = null; return; }

    try {
      const pip = await (window as any).documentPictureInPicture.requestWindow({
        width: 380, height: 520,
        disallowReturnToOpener: false,
      });
      pipRef.current = pip;

      pip.document.head.insertAdjacentHTML('beforeend', `<style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        #pip-root{display:flex;flex-direction:column;height:100vh}
        #pip-header{background:#1a1a2e;padding:10px 14px;border-bottom:1px solid rgba(139,92,246,0.3);display:flex;align-items:center;gap:8px;flex-shrink:0}
        #pip-header span{font-size:12px;font-weight:700;color:rgba(167,139,250,1)}
        #pip-q{padding:10px 14px;background:rgba(139,92,246,0.08);border-bottom:1px solid rgba(139,92,246,0.15);font-size:11px;color:rgba(167,139,250,0.9);line-height:1.5;flex-shrink:0;display:none}
        #pip-ans{flex:1;overflow-y:auto;padding:14px;font-size:13px;line-height:1.7;color:rgba(255,255,255,0.88);white-space:pre-wrap;word-break:break-word}
        #pip-empty{color:rgba(255,255,255,0.2);font-size:13px;padding:20px 14px}
        .cursor{display:inline-block;width:2px;height:14px;background:#a78bfa;vertical-align:text-bottom;border-radius:1px;animation:blink 0.9s step-end infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(139,92,246,0.4);border-radius:2px}
      </style>`);

      pip.document.body.innerHTML = `
        <div id="pip-root">
          <div id="pip-header"><span>📖 CoachAI — Exam Answer</span></div>
          <div id="pip-q"></div>
          <div id="pip-ans"><div id="pip-empty">Capture your screen to get an answer…</div></div>
        </div>`;

      contentRef.current = pip.document.getElementById('pip-ans') as HTMLDivElement;

      pip.addEventListener('pagehide', () => { pipRef.current = null; contentRef.current = null; });
    } catch (err) {
      console.error('PiP failed', err);
    }
  }, []);

  const updatePiP = useCallback((question: string, answer: string, streaming: boolean) => {
    const pip = pipRef.current;
    if (!pip) return;
    const qEl  = pip.document.getElementById('pip-q') as HTMLDivElement | null;
    const aEl  = pip.document.getElementById('pip-ans') as HTMLDivElement | null;
    if (!aEl) return;
    if (qEl) {
      if (question && question !== 'Detecting question…') {
        qEl.style.display = 'block';
        qEl.textContent = question;
      } else {
        qEl.style.display = 'none';
      }
    }
    const cursor = streaming ? '<span class="cursor"></span>' : '';
    if (answer) {
      aEl.innerHTML = answer.replace(/</g, '&lt;').replace(/>/g, '&gt;') + cursor;
    } else if (streaming) {
      aEl.innerHTML = `<span style="color:rgba(167,139,250,0.6);font-size:13px">Thinking…${cursor}</span>`;
    } else {
      aEl.innerHTML = '<div id="pip-empty">Capture your screen to get an answer…</div>';
    }
  }, []);

  const isPiPOpen = useCallback(() => !!pipRef.current, []);

  return { openPiP, updatePiP, isPiPOpen };
}

// ── Electron API type ─────────────────────────────────────────────────────────
interface ElectronSource { id: string; name: string; thumbnail: string }
interface ElectronAPI {
  isElectron: boolean;
  listSources: () => Promise<ElectronSource[]>;
  captureSource: (sourceId: string) => Promise<string | null>;
}
function getElectronAPI(): ElectronAPI | null {
  const api = (window as any).electronAPI;
  return api?.isElectron ? api : null;
}

// ── Broadcast to float overlay (same channel as interview mode) ───────────────
function useFloatBroadcast() {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const ch = new BroadcastChannel('parakeet-float');
    channelRef.current = ch;
    const broadcast = () => {
      const { currentAnswer, isGeneratingAnswer, qaPairs, setupData } = useSessionStore.getState();
      ch.postMessage({
        type: 'state',
        payload: { currentAnswer, isGeneratingAnswer, qaPairs, interimText: '', transcript: [], setupData },
      });
    };
    ch.onmessage = (e) => { if (e.data?.type === 'float-ready') broadcast(); };
    const unsub = useSessionStore.subscribe(broadcast);
    return () => { unsub(); ch.close(); };
  }, []);
}

// ── Markdown renderer (simple) ────────────────────────────────────────────────
function AnswerText({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let codeBlock = false;
  let codeLines: string[] = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (!codeBlock) {
        codeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        elements.push(
          <pre key={i} className="bg-black/50 border border-white/10 rounded-lg p-4 my-3 overflow-x-auto">
            <code className="text-green-300 text-sm font-mono">{codeLines.join('\n')}</code>
          </pre>
        );
        codeBlock = false;
        codeLines = [];
      }
    } else if (codeBlock) {
      codeLines.push(line);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-white font-bold text-base mt-4 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-white font-bold text-lg mt-4 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-white font-bold text-xl mt-4 mb-2">{line.slice(2)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} className="text-white/80 text-sm ml-4 list-disc">{line.slice(2)}</li>);
    } else if (/^\d+\. /.test(line)) {
      elements.push(<li key={i} className="text-white/80 text-sm ml-4 list-decimal">{line.replace(/^\d+\. /, '')}</li>);
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      // Inline bold
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={i} className="text-white/85 text-sm leading-relaxed">
          {parts.map((p, j) =>
            p.startsWith('**') && p.endsWith('**')
              ? <strong key={j} className="text-white font-semibold">{p.slice(2, -2)}</strong>
              : p
          )}
        </p>
      );
    }
  }

  return <div className="space-y-1">{elements}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExamSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  useFloatBroadcast();

  const { setupData, currentAnswer, setCurrentAnswer, appendCurrentAnswer, isGeneratingAnswer, setIsGeneratingAnswer, addQAPair, updateLastAnswer, clearSession } = useSessionStore();
  const { openPiP, updatePiP, isPiPOpen } = useExamPiP();
  const [pipOpen, setPipOpen] = useState(false);

  const [screenshot, setScreenshot]       = useState<string | null>(null); // base64
  const [detectedQ, setDetectedQ]         = useState<string>('');
  const [capturing, setCapturing]         = useState(false);
  const [autoCapture, setAutoCapture]     = useState(false);
  const [captureInterval, setCaptureIntervalVal] = useState(10); // seconds
  const [elapsed, setElapsed]             = useState(0);
  const [qCount, setQCount]               = useState(0);
  // Full Q&A history for context retention across questions
  const qaHistoryRef = useRef<{ question: string; answer: string }[]>([]);

  const autoCaptureRef   = useRef(false);
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownValRef  = useRef(0);
  const [countdown, setCountdown]         = useState(0);

  // ── Persistent screen share — pick once, capture instantly ─────────────────
  const shareStreamRef = useRef<MediaStream | null>(null);
  const shareVideoRef  = useRef<HTMLVideoElement | null>(null);
  const [shareActive, setShareActive] = useState(false);

  // Electron-specific: selected source ID + source picker
  const electronSourceRef = useRef<string | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [availableSources, setAvailableSources] = useState<ElectronSource[]>([]);

  // Acquire a browser stream and return it (sets up refs + state)
  const acquireBrowserStream = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080 },
        audio: false,
      } as any);
      stream.getVideoTracks()[0].onended = () => {
        shareStreamRef.current = null;
        shareVideoRef.current  = null;
        setShareActive(false);
      };
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      shareStreamRef.current = stream;
      shareVideoRef.current  = video;
      setShareActive(true);
      return stream;
    } catch {
      return null; // user cancelled
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    const eApi = getElectronAPI();
    if (eApi) {
      try {
        const sources = await eApi.listSources();
        setAvailableSources(sources);
        setShowSourcePicker(true);
      } catch (err: any) {
        if (err?.message?.includes('SCREEN_PERMISSION_DENIED')) {
          setDetectedQ('⚠️ Screen Recording permission required. System Preferences has been opened — grant access for this app, then restart.');
        }
      }
      return;
    }
    await acquireBrowserStream();
  }, [acquireBrowserStream]);

  const selectElectronSource = useCallback((sourceId: string) => {
    electronSourceRef.current = sourceId;
    setShowSourcePicker(false);
    setShareActive(true);
  }, []);

  const stopScreenShare = useCallback(() => {
    shareStreamRef.current?.getTracks().forEach((t) => t.stop());
    shareStreamRef.current = null;
    shareVideoRef.current  = null;
    electronSourceRef.current = null;
    setShareActive(false);
    autoCaptureRef.current = false;
    setAutoCapture(false);
    if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current  = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(0);
  }, []);

  // Grab a frame from existing share
  const grabFrame = useCallback(async (): Promise<string | null> => {
    const eApi = getElectronAPI();
    if (eApi && electronSourceRef.current) {
      return await eApi.captureSource(electronSourceRef.current);
    }
    const video = shareVideoRef.current;
    if (!video || !shareStreamRef.current?.active) return null;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    shareStreamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Session timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Capture + analyze ──────────────────────────────────────────────────────
  const analyze = useCallback(async () => {
    if (capturing || isGeneratingAnswer) return;

    const eApi = getElectronAPI();
    setCapturing(true);

    let base64: string | null = null;

    if (eApi) {
      // Electron: show source picker if no source selected yet
      if (!electronSourceRef.current) {
        setCapturing(false);
        try {
          const sources = await eApi.listSources();
          setAvailableSources(sources);
          setShowSourcePicker(true);
        } catch (err: any) {
          if (err?.message?.includes('SCREEN_PERMISSION_DENIED')) {
            setDetectedQ('⚠️ Screen Recording permission required. System Preferences has been opened — grant access for this app, then restart.');
          }
        }
        return;
      }
      base64 = await eApi.captureSource(electronSourceRef.current);
    } else {
      // Browser: acquire stream if needed, then capture — all in one click
      if (!shareStreamRef.current?.active) {
        const stream = await acquireBrowserStream();
        if (!stream) { setCapturing(false); return; } // user cancelled picker
      }
      base64 = await grabFrame();
    }

    if (!base64) {
      setCapturing(false);
      return;
    }

    setScreenshot(base64);
    setCapturing(false);
    setDetectedQ('Detecting question…');
    setCurrentAnswer('');
    setIsGeneratingAnswer(true);
    updatePiP('', '', true);

    try {
      const res = await fetch('/api/exam/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          subject: setupData.jobTitle,
          context: setupData.extraContext,
          model: setupData.model,
          previousQA: qaHistoryRef.current,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Failed');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let question  = '';
      let answer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;

          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'question') {
              question = evt.text;
              setDetectedQ(question);
              updatePiP(question, answer, true);
            } else if (evt.token) {
              answer += evt.token;
              appendCurrentAnswer(evt.token);
              updatePiP(question, answer, true);
            }
          } catch {}
        }
      }

      updatePiP(question, answer, false);

      // Persist Q&A pair and retain full context for next question
      if (question && answer) {
        qaHistoryRef.current.push({ question, answer });
        addQAPair({ id: crypto.randomUUID(), question, answer: '', timestamp: Date.now() });
        updateLastAnswer(answer);
        setQCount((c) => c + 1);
      }
    } catch (err) {
      console.error('[exam analyze]', err);
      setDetectedQ('Failed to analyze screenshot. Try again.');
    } finally {
      setIsGeneratingAnswer(false);
    }
  }, [capturing, isGeneratingAnswer, setupData, setCurrentAnswer, appendCurrentAnswer, setIsGeneratingAnswer, addQAPair, updateLastAnswer, updatePiP]);

  // ── Auto-capture toggle ────────────────────────────────────────────────────
  const startAutoCapture = useCallback(() => {
    autoCaptureRef.current = true;
    setAutoCapture(true);
    countdownValRef.current = captureInterval;
    setCountdown(captureInterval);

    countdownRef.current = setInterval(() => {
      countdownValRef.current -= 1;
      setCountdown(countdownValRef.current);
      if (countdownValRef.current <= 0) {
        countdownValRef.current = captureInterval;
        setCountdown(captureInterval);
      }
    }, 1000);

    intervalRef.current = setInterval(() => {
      if (autoCaptureRef.current) analyze();
    }, captureInterval * 1000);
  }, [analyze, captureInterval]);

  const stopAutoCapture = useCallback(() => {
    autoCaptureRef.current = false;
    setAutoCapture(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    stopAutoCapture();
    shareStreamRef.current?.getTracks().forEach((t) => t.stop());
    clearSession();
  }, []);

  const stopSession = () => {
    stopAutoCapture();
    stopScreenShare();
    clearSession();
    router.push('/dashboard');
  };

  return (
    <StealthModeWrapper>
      {/* ── Electron Source Picker Modal ── */}
      {showSourcePicker && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg">Select a window to capture</h2>
              <button onClick={() => setShowSourcePicker(false)} className="text-white/40 hover:text-white/60">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {availableSources.map((src) => (
                <button
                  key={src.id}
                  onClick={() => selectElectronSource(src.id)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/10 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all"
                >
                  <img src={src.thumbnail} alt={src.name} className="w-full rounded-lg border border-white/5" />
                  <span className="text-white/70 text-xs truncate max-w-full">{src.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="h-screen flex flex-col bg-[#0A0A0F] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <BookOpen className="h-4 w-4 text-violet-400" />
            <span className="text-white font-semibold text-sm">
              {setupData.jobTitle || 'Exam'} Session
            </span>
            <span className="text-white/30 text-xs border border-white/10 rounded px-2 py-0.5">{setupData.model}</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={async () => { await openPiP(); setPipOpen(isPiPOpen()); }}
              title="Float answer on top of your screen"
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                pipOpen
                  ? 'border-violet-500/60 bg-violet-500/15 text-violet-300'
                  : 'border-white/10 bg-white/5 text-white/40 hover:text-white/60 hover:border-white/20'
              }`}
            >
              <PictureInPicture2 className="h-3.5 w-3.5" />
              {pipOpen ? 'Floating' : 'Float Answer'}
            </button>
            <div className="flex items-center gap-1.5 text-white/40 text-xs">
              <Clock className="h-3 w-3" />
              {formatTime(elapsed)}
            </div>
            <span className="text-white/40 text-xs">{qCount} question{qCount !== 1 ? 's' : ''} answered</span>
            <Button variant="ghost" size="sm" onClick={stopSession} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
              <Square className="h-3 w-3 mr-1.5" />
              End
            </Button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left — screenshot panel */}
          <div className="w-1/2 border-r border-white/10 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-white/50 text-xs font-medium uppercase tracking-wide">Screen Capture</span>
              <div className="flex items-center gap-3">
                {autoCapture && countdown > 0 && (
                  <span className="text-violet-300 text-xs">Next in {countdown}s</span>
                )}
                {shareActive ? (
                  <button onClick={stopScreenShare} className="flex items-center gap-1.5 text-green-400 text-xs">
                    <Monitor className="h-3 w-3" />
                    <span>Sharing</span>
                    <span className="text-white/30 hover:text-red-400 cursor-pointer ml-1">✕</span>
                  </button>
                ) : (
                  <button onClick={startScreenShare} className="flex items-center gap-1.5 text-white/40 hover:text-white/60 text-xs transition-colors">
                    <Monitor className="h-3 w-3" />
                    Select Window
                  </button>
                )}
              </div>
            </div>

            {/* Screenshot preview */}
            <div className="flex-1 overflow-hidden relative">
              {screenshot ? (
                <img
                  src={`data:image/png;base64,${screenshot}`}
                  alt="Captured screen"
                  className="w-full h-full object-contain bg-black/40"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20">
                  {shareActive ? (
                    <>
                      <Monitor className="h-10 w-10 text-green-500/40" />
                      <p className="text-sm text-green-400/60">Window connected</p>
                      <p className="text-xs">Press Capture or enable Auto to start scanning</p>
                    </>
                  ) : (
                    <>
                      <Camera className="h-10 w-10" />
                      <p className="text-sm">No window selected</p>
                      <p className="text-xs">Click "Select Window" to choose which screen to capture</p>
                    </>
                  )}
                </div>
              )}
              {capturing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
                </div>
              )}
            </div>

            {/* Detected question */}
            {detectedQ && (
              <div className="px-4 py-3 border-t border-white/10 bg-violet-500/5">
                <p className="text-violet-300 text-xs font-medium mb-1">Detected Question</p>
                <p className="text-white/70 text-sm leading-relaxed line-clamp-3">{detectedQ}</p>
              </div>
            )}

            {/* Controls */}
            <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3">
              <Button
                onClick={analyze}
                disabled={capturing || isGeneratingAnswer}
                className="flex-1 bg-violet-600 hover:bg-violet-500 text-white"
              >
                {!shareActive ? (
                  <><Monitor className="h-4 w-4 mr-2" />Select Window</>
                ) : capturing ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Capturing…</>
                ) : isGeneratingAnswer ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing…</>
                ) : (
                  <><Camera className="h-4 w-4 mr-2" />Capture & Analyze</>
                )}
              </Button>

              <button
                onClick={autoCapture ? stopAutoCapture : startAutoCapture}
                disabled={!shareActive}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition-all ${
                  autoCapture
                    ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                    : shareActive
                      ? 'border-white/10 bg-white/5 text-white/50 hover:bg-white/8'
                      : 'border-white/5 bg-white/2 text-white/20 cursor-not-allowed'
                }`}
              >
                {autoCapture ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                Auto
              </button>

              {/* Interval picker */}
              <select
                value={captureInterval}
                onChange={(e) => { setCaptureIntervalVal(Number(e.target.value)); if (autoCapture) { stopAutoCapture(); } }}
                disabled={!shareActive}
                className="bg-white/5 border border-white/10 text-white/50 text-xs rounded-lg px-2 py-2 disabled:opacity-30"
              >
                {[5, 10, 15, 20, 30].map((s) => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right — answer panel */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-white/50 text-xs font-medium uppercase tracking-wide">Answer</span>
              {isGeneratingAnswer && (
                <div className="flex items-center gap-1.5 text-violet-300 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating…
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {currentAnswer ? (
                <AnswerText text={currentAnswer} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20">
                  <RefreshCw className="h-8 w-8" />
                  <p className="text-sm">Answer will appear here</p>
                  <p className="text-xs">Capture your screen to get started</p>
                </div>
              )}
              {isGeneratingAnswer && currentAnswer && (
                <span className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          </div>
        </div>
      </div>
    </StealthModeWrapper>
  );
}

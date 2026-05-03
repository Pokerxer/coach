'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/session';
import { useSession } from '@/hooks/useSession';
import { SessionHeader } from '@/components/session/SessionHeader';
import { TranscriptPanel } from '@/components/session/TranscriptPanel';
import { AnswerPanel } from '@/components/session/AnswerPanel';
import { SessionControls } from '@/components/session/SessionControls';
import { CodingMode } from '@/components/session/CodingMode';
import { StealthModeWrapper } from '@/components/session/StealthMode';
import toast from 'react-hot-toast';

// ─── Screen capture + visual question analysis for interview mode ─────────────
function useScreenCapture() {
  const browserStreamRef = useRef<MediaStream | null>(null);
  const electronSourceRef = useRef<string | null>(null);
  const qaHistoryRef = useRef<{ question: string; answer: string }[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [sources, setSources] = useState<{ id: string; name: string; thumbnail: string }[]>([]);

  // Keep qa history ref in sync with store
  useEffect(() => {
    return useSessionStore.subscribe((state) => {
      qaHistoryRef.current = state.qaPairs
        .filter((p) => p.answer)
        .slice(-6)
        .map((p) => ({ question: p.question, answer: p.answer }));
    });
  }, []);

  const grabFrame = useCallback(async (): Promise<string | null> => {
    const eApi = (window as any).electronAPI;

    // Electron path
    if (eApi?.captureSource) {
      if (!electronSourceRef.current) {
        // Need to pick a source first
        try {
          const srcs = await eApi.listSources();
          setSources(srcs);
          setShowSourcePicker(true);
          return null; // caller must retry after picker resolves
        } catch (err: any) {
          if (err?.message?.includes('SCREEN_PERMISSION_DENIED')) {
            toast.error('Grant screen recording permission in System Preferences');
          } else {
            toast.error('Failed to get sources');
          }
          return null;
        }
      }
      try {
        const base64 = await eApi.captureSource(electronSourceRef.current);
        return base64;
      } catch {
        toast.error('Screen capture failed');
        return null;
      }
    }

    // Browser path — use persistent stream
    if (!browserStreamRef.current) {
      try {
        browserStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 1 },
          audio: false,
        });
        browserStreamRef.current.getVideoTracks()[0].addEventListener('ended', () => {
          browserStreamRef.current = null;
        });
      } catch {
        toast.error('Screen sharing cancelled');
        return null;
      }
    }

    const track = browserStreamRef.current.getVideoTracks()[0];
    const capture = new (window as any).ImageCapture(track);
    try {
      const bitmap = await capture.grabFrame();
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      bitmap.close();
      return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    } catch {
      // Fallback: video element
      const video = document.createElement('video');
      video.srcObject = browserStreamRef.current;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      video.pause();
      return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    }
  }, []);

  const analyzeImage = useCallback(async (imageBase64: string) => {
    const {
      addQAPair, setCurrentAnswer, appendCurrentAnswer,
      setIsGeneratingAnswer, updateLastAnswer, sessionId,
    } = useSessionStore.getState();

    setIsGeneratingAnswer(true);
    setCurrentAnswer('');

    const pairId = crypto.randomUUID();
    addQAPair({ id: pairId, question: 'Analyzing screen…', answer: '', timestamp: Date.now() });

    try {
      const res = await fetch('/api/exam/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          model: useSessionStore.getState().setupData.model,
          previousQA: qaHistoryRef.current,
        }),
      });

      if (!res.ok || !res.body) {
        toast.error('Analysis failed');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = '';
      let question = 'Screen capture';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const obj = JSON.parse(raw);
            if (obj.type === 'question') {
              question = obj.text;
              // Update the placeholder question text
              const pairs = useSessionStore.getState().qaPairs;
              const idx = pairs.findIndex((p) => p.id === pairId);
              if (idx !== -1) {
                const updated = [...pairs];
                updated[idx] = { ...updated[idx], question };
                useSessionStore.setState({ qaPairs: updated });
              }
            } else if (obj.token) {
              appendCurrentAnswer(obj.token);
              fullAnswer += obj.token;
            }
          } catch {}
        }
      }

      updateLastAnswer(fullAnswer);

      // Add to local QA history for next capture
      qaHistoryRef.current = [
        ...qaHistoryRef.current,
        { question, answer: fullAnswer },
      ].slice(-6);

      if (sessionId) {
        fetch(`/api/sessions/${sessionId}/qa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer: fullAnswer }),
        }).catch(() => {});
      }
    } finally {
      setIsGeneratingAnswer(false);
    }
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const image = await grabFrame();
      if (!image) return; // source picker opened or error
      await analyzeImage(image);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, grabFrame, analyzeImage]);

  const selectSource = useCallback(async (sourceId: string) => {
    electronSourceRef.current = sourceId;
    setShowSourcePicker(false);
    // Now capture with the selected source
    setIsCapturing(true);
    try {
      const eApi = (window as any).electronAPI;
      const base64 = await eApi.captureSource(sourceId);
      if (base64) await analyzeImage(base64);
    } finally {
      setIsCapturing(false);
    }
  }, [analyzeImage]);

  return {
    captureAndAnalyze,
    isCapturing,
    showSourcePicker,
    sources,
    selectSource,
    onCloseSourcePicker: () => setShowSourcePicker(false),
  };
}

// ─── Source picker modal (Electron only) ─────────────────────────────────────
function SourcePickerModal({
  sources,
  onSelect,
  onClose,
}: {
  sources: { id: string; name: string; thumbnail: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-[#13131a] border border-white/15 rounded-2xl p-5 w-[560px] max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white/80 mb-4">Select a window to capture</h3>
        <div className="grid grid-cols-2 gap-3">
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="rounded-xl border border-white/10 bg-white/5 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all p-2 text-left"
            >
              <img src={s.thumbnail} alt={s.name} className="w-full rounded-lg mb-2 aspect-video object-cover bg-black" />
              <p className="text-xs text-white/60 truncate">{s.name}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Broadcast session state to the Electron overlay window via BroadcastChannel
function useFloatBroadcast() {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const ch = new BroadcastChannel('parakeet-float');
    channelRef.current = ch;

    // When float window comes online, immediately send current state
    ch.onmessage = (e) => {
      if (e.data?.type === 'float-ready') broadcast();
    };

    const broadcast = () => {
      const { currentAnswer, isGeneratingAnswer, qaPairs, interimText, transcript, setupData } =
        useSessionStore.getState();
      ch.postMessage({
        type: 'state',
        payload: { currentAnswer, isGeneratingAnswer, qaPairs, interimText, transcript: transcript.slice(-5), setupData },
      });
    };

    // Subscribe to store changes and broadcast
    const unsub = useSessionStore.subscribe(broadcast);
    return () => { unsub(); ch.close(); };
  }, []);
}

export default function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { codingMode, clearSession } = useSessionStore();
  const { startSession, stopSession, toggleMute, triggerManual } = useSession(id);

  // Clear stale state from any previous session the moment this session mounts
  useEffect(() => { clearSession(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const {
    captureAndAnalyze, isCapturing,
    showSourcePicker, sources, selectSource, onCloseSourcePicker,
  } = useScreenCapture();
  useFloatBroadcast();

  return (
    <StealthModeWrapper>
      <div className="h-screen flex flex-col bg-[#0A0A0F] overflow-hidden">
        <SessionHeader />

        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-white/10 flex flex-col overflow-hidden">
            <TranscriptPanel />
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden">
            <AnswerPanel />
          </div>
        </div>

        {codingMode && <CodingMode />}

        <SessionControls
          onStart={startSession}
          onStop={stopSession}
          onToggleMute={toggleMute}
          onTriggerManual={triggerManual}
          onCaptureScreen={captureAndAnalyze}
          isCapturing={isCapturing}
        />

        {showSourcePicker && (
          <SourcePickerModal
            sources={sources}
            onSelect={selectSource}
            onClose={onCloseSourcePicker}
          />
        )}
      </div>
    </StealthModeWrapper>
  );
}

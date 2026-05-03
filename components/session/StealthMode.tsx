'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/store/session';

const STEALTH_STATE_KEY = 'parakeet-stealth-state';
const STEALTH_CHANNEL = 'parakeet-stealth-channel';

function saveStealthState(state: object) {
  try {
    localStorage.setItem(STEALTH_STATE_KEY, JSON.stringify(state));
  } catch {}
}

function getStealthState(): { currentAnswer: string; isGeneratingAnswer: boolean; qaPairs: Array<{ question?: string }>; transcript: Array<{ id: string; text: string }> } | null {
  try {
    const data = localStorage.getItem(STEALTH_STATE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function syncToExternal() {
  const state = useSessionStore.getState();
  const payload = {
    currentAnswer: state.currentAnswer,
    isGeneratingAnswer: state.isGeneratingAnswer,
    qaPairs: state.qaPairs,
    transcript: state.transcript,
  };
  saveStealthState(payload);
  try {
    const bc = new BroadcastChannel(STEALTH_CHANNEL);
    bc.postMessage({ type: 'STATE_UPDATE', ...payload });
    bc.close();
  } catch {}
}

const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

export function StealthModeWrapper({ children }: { children: React.ReactNode }) {
  const [stealth, setStealth] = useState(false);
  const pipWindowRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handler = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      setStealth((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);

  useEffect(() => {
    if (!stealth && pipWindowRef.current) {
      try {
        pipWindowRef.current.close();
      } catch {}
      pipWindowRef.current = null;
    }
  }, [stealth]);

  useEffect(() => {
    if (!stealth) return;

    // Push initial state immediately
    syncToExternal();

    // Subscribe to store changes and keep the PiP in sync in real time.
    // This is what makes streaming answers and live transcript updates visible
    // inside the stealth window without relying on the 400ms poll.
    const unsubStore = useSessionStore.subscribe(() => syncToExternal());

    const openStealthPip = async () => {
      if (!('documentPictureInPicture' in window)) {
        console.warn('Document PiP not supported');
        return false;
      }

      try {
        const pip = await (window as any).documentPictureInPicture.requestWindow({
          width: 340,
          height: 440,
          disallowReturnToOpener: true,
          preferInitialWindowPlacement: true,
        });

        pipWindowRef.current = pip;

        const container = pip.document.createElement('div');
        container.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

        const header = pip.document.createElement('div');
        header.style.cssText = 'background:rgba(240,240,240,0.95);padding:8px 12px;font-size:11px;color:#555;border-bottom:1px solid #ccc;display:flex;gap:10px';
        header.innerHTML = '<span>📄</span><span style="color:#333">Notes</span>';

        const content = pip.document.createElement('div');
        content.id = 'stealth-content';
        content.style.cssText = 'padding:12px;font-size:12px;line-height:1.5;color:#111;overflow-y:auto;max-height:calc(100vh - 40px);text-shadow:0 0 3px rgba(255,255,255,0.6)';

        container.appendChild(header);
        container.appendChild(content);
        pip.document.body.appendChild(container);

        // BroadcastChannel: receives every store change pushed by unsubStore above
        const bc = new BroadcastChannel(STEALTH_CHANNEL);
        bc.onmessage = (e: any) => {
          if (e.data?.type === 'STATE_UPDATE') {
            content.innerHTML = renderContentHTML(e.data);
          }
        };

        // Render current state immediately when PiP opens
        const current = getStealthState();
        if (current) content.innerHTML = renderContentHTML(current);

        // Fallback poll — catches any edge cases where broadcast is missed
        const interval = setInterval(() => {
          const state = getStealthState();
          if (state) content.innerHTML = renderContentHTML(state);
        }, 400);

        pip.addEventListener('pagehide', () => {
          clearInterval(interval);
          bc.close();
          setStealth(false);
        });

        return true;
      } catch (err) {
        console.error('PiP failed:', err);
        return false;
      }
    };

    openStealthPip().then((success) => {
      if (!success) setStealth(false);
    });

    return () => unsubStore();
  }, [stealth]);

  if (!stealth) return <>{children}</>;
  return <MinimalOverlay containerRef={containerRef} />;
}

function MinimalOverlay({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 320,
        height: 1,
        zIndex: 9999,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    />
  );
}

function renderContentHTML(data: {
  currentAnswer: string;
  isGeneratingAnswer: boolean;
  qaPairs: Array<{ question?: string }>;
  transcript: Array<{ id: string; text: string }>;
}) {
  const { currentAnswer, isGeneratingAnswer, qaPairs, transcript } = data;
  const latestQ = qaPairs[qaPairs.length - 1]?.question ?? '';
  const cursor = isGeneratingAnswer ? '<span style="display:inline-block;width:1.5px;height:12px;background:#1d4ed8;vertical-align:text-bottom;border-radius:1px"></span>' : '';

  let html = '';

  if (transcript && transcript.length > 0) {
    html += `<div style="margin-bottom:8px">`;
    html += transcript.slice(-2).map((line: any) => `<div style="color:#444;margin:3px 0;font-size:11px">• ${line.text.substring(0, 60)}${line.text.length > 60 ? '...' : ''}</div>`).join('');
    html += `</div>`;
  }

  if (latestQ) {
    html += `<div style="color:#1d4ed8;font-size:11px;font-weight:600;margin-bottom:6px;border-left:2px solid #1d4ed8;padding-left:6px">Q: ${latestQ.substring(0, 80)}${latestQ.length > 80 ? '...' : ''}</div>`;
  }

  if (currentAnswer) {
    html += `<div style="white-space:pre-wrap;color:#111;font-size:12px;line-height:1.6">${currentAnswer.substring(0, 500)}${currentAnswer.length > 500 ? '...' : ''}${cursor}</div>`;
  }

  if (!currentAnswer && (!transcript || transcript.length === 0)) {
    html += `<div style="color:#999;font-size:11px">...</div>`;
  }

  return html;
}
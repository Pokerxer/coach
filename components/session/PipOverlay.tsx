'use client';

import { useCallback, useRef, useState } from 'react';
import { useSessionStore } from '@/store/session';
import { Button } from '@/components/ui/button';
import { PictureInPicture2 } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Markdown → HTML ──────────────────────────────────────────────────────────

function mdToHtml(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (line: string): string =>
    esc(line)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, `<code style="background:rgba(0,0,0,0.5);color:#67e8f9;padding:2px 7px;border-radius:4px;font-size:0.9em;font-family:'SF Mono',Menlo,monospace">$1</code>`);

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1] || 'code';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      out.push(
        `<div style="margin:10px 0;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.15)">` +
        `<div style="background:rgba(0,0,0,0.7);padding:5px 12px;font-size:11px;color:rgba(255,255,255,0.5);font-family:monospace;text-transform:uppercase;letter-spacing:0.1em">${esc(lang)}</div>` +
        `<pre style="margin:0;padding:14px;background:rgba(0,0,0,0.72)!important;background-color:rgba(0,0,0,0.72)!important;overflow-x:auto;font-size:14px;line-height:1.65;font-family:'SF Mono',Menlo,monospace"><code style="color:#e6edf3;text-shadow:none;background:transparent!important">${codeLines.map(esc).join('\n')}</code></pre>` +
        `</div>`
      );
      i++; continue;
    }

    if (line.startsWith('### ')) {
      out.push(`<p style="${P} font-size:17px;font-weight:800;margin:12px 0 5px">${inline(line.slice(4))}</p>`);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      out.push(`<p style="${P} font-size:18px;font-weight:900;margin:14px 0 6px">${inline(line.slice(3))}</p>`);
      i++; continue;
    }

    const num = line.match(/^(\d+)\.\s+(.*)/);
    if (num) {
      out.push(
        `<div style="display:flex;gap:10px;margin:5px 0">` +
        `<span style="${P} color:rgba(103,232,249,0.9);font-family:monospace;font-size:14px;padding-top:2px;min-width:18px;text-align:right;flex-shrink:0">${num[1]}.</span>` +
        `<span style="${P} font-size:16px;line-height:1.65;font-weight:700">${inline(num[2])}</span>` +
        `</div>`
      );
      i++; continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)/);
    if (bullet) {
      out.push(
        `<div style="display:flex;gap:10px;margin:5px 0">` +
        `<span style="${P} color:rgba(103,232,249,0.9);font-size:11px;padding-top:5px;flex-shrink:0">▸</span>` +
        `<span style="${P} font-size:16px;line-height:1.65;font-weight:700">${inline(bullet[1])}</span>` +
        `</div>`
      );
      i++; continue;
    }

    if (!line.trim()) { out.push(`<div style="height:7px"></div>`); i++; continue; }

    out.push(`<p style="${P} font-size:16px;line-height:1.7;font-weight:700;margin:4px 0">${inline(line)}</p>`);
    i++;
  }

  return out.join('');
}

// Shared text style — white + strong shadow so it reads over anything behind it
const P = 'color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.95),0 0 12px rgba(0,0,0,0.8);';

// ─── Screen capture ───────────────────────────────────────────────────────────

async function captureScreenshot(): Promise<string> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 } as any, audio: false });
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.onloadedmetadata = async () => {
      await video.play();
      requestAnimationFrame(() => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        stream.getTracks().forEach((t) => t.stop());
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      });
    };
    video.onerror = reject;
  });
}

// ─── PiP content ─────────────────────────────────────────────────────────────

function renderPipContent(pip: Window, container: HTMLElement, model: string) {
  let mode: 'answer' | 'code' = 'answer';
  let codeAnswer = '';
  let codeScanning = false;

  // Reading-pace auto-scroll (~230 wpm → ~18px/sec)
  const READING_PX_PER_TICK = (18 * 80) / 1000;
  let scrollTimer: ReturnType<typeof pip.setInterval> | null = null;
  let wasGenerating = false;
  let userScrolled = false;

  function stopScroll() {
    if (scrollTimer !== null) { pip.clearInterval(scrollTimer); scrollTimer = null; }
  }

  function startReadingScroll() {
    stopScroll(); userScrolled = false;
    scrollTimer = pip.setInterval(() => {
      const el = pip.document.getElementById('pip-scroll');
      if (!el || userScrolled) { stopScroll(); return; }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) { stopScroll(); return; }
      el.scrollTop += READING_PX_PER_TICK;
    }, 80);
  }

  const STYLES = `
    * { box-sizing: border-box; }
    html, body { background: transparent !important; background-color: transparent !important; }
    ::-webkit-scrollbar { display: none; }
    @keyframes spin  { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.1} }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    strong { color:#fff; }
    pre, code { background: transparent !important; }
  `;

  // ── Full render (on mode switch only) ─────────────────────
  function fullRender() {
    container.innerHTML = `
      <style>${STYLES}</style>

      <!-- Floating tab bar — slight dark pill so buttons are clickable -->
      <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:10;display:flex;gap:4px;background:rgba(0,0,0,0.55);border-radius:20px;padding:4px 6px;backdrop-filter:blur(8px)">
        <button id="tab-answer" style="cursor:pointer;font-size:12px;font-weight:700;padding:4px 14px;border-radius:14px;border:none;font-family:inherit;
          background:${mode === 'answer' ? 'rgba(34,211,238,0.25)' : 'transparent'};
          color:${mode === 'answer' ? '#22d3ee' : 'rgba(255,255,255,0.45)'}">Answer</button>
        <button id="tab-code" style="cursor:pointer;font-size:12px;font-weight:700;padding:4px 14px;border-radius:14px;border:none;font-family:inherit;
          background:${mode === 'code' ? 'rgba(34,211,238,0.25)' : 'transparent'};
          color:${mode === 'code' ? '#22d3ee' : 'rgba(255,255,255,0.45)'}">📷 Scan Code</button>
      </div>

      <!-- Scrollable body — fully transparent -->
      <div id="pip-scroll" style="position:absolute;inset:0;overflow-y:auto;padding:54px 16px 16px">
        ${mode === 'answer' ? buildAnswerInner() : buildCodeInner()}
      </div>
    `;

    pip.document.getElementById('tab-answer')!.onclick = () => { if (mode !== 'answer') { mode = 'answer'; stopScroll(); fullRender(); } };
    pip.document.getElementById('tab-code')!.onclick   = () => { if (mode !== 'code')   { mode = 'code';   stopScroll(); fullRender(); } };

    const scrollEl = pip.document.getElementById('pip-scroll');
    scrollEl?.addEventListener('wheel',     () => { userScrolled = true; stopScroll(); }, { passive: true });
    scrollEl?.addEventListener('touchmove', () => { userScrolled = true; stopScroll(); }, { passive: true });

    if (mode === 'code') {
      pip.document.getElementById('btn-scan')?.addEventListener('click', onScanCode);
    }
  }

  // ── Answer inner HTML ──────────────────────────────────────
  function buildAnswerInner(): string {
    return `
      <div id="pip-question"></div>
      <div id="pip-answer" style="margin-top:8px"></div>
      <div id="pip-interim" style="margin-top:10px"></div>
    `;
  }

  // ── Incremental answer update ──────────────────────────────
  function updateAnswerContent() {
    const { currentAnswer, isGeneratingAnswer, qaPairs, interimText } = useSessionStore.getState();
    const latestQ = qaPairs[qaPairs.length - 1]?.question ?? '';

    // Question
    const qEl = pip.document.getElementById('pip-question');
    if (qEl) {
      qEl.innerHTML = latestQ
        ? `<div style="display:inline-block;background:rgba(0,0,0,0.5);border-radius:8px;padding:6px 12px;margin-bottom:4px">
            <span style="font-size:14px;font-weight:800;color:#22d3ee;text-shadow:0 1px 6px rgba(0,0,0,0.9);line-height:1.5;display:block">${latestQ.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>
           </div>`
        : '';
    }

    // Answer
    const aEl = pip.document.getElementById('pip-answer');
    if (aEl) {
      if (currentAnswer) {
        aEl.innerHTML =
          mdToHtml(currentAnswer) +
          (isGeneratingAnswer
            ? '<span style="display:inline-block;width:3px;height:18px;background:#22d3ee;margin-left:3px;vertical-align:middle;animation:blink 0.9s step-end infinite;border-radius:2px"></span>'
            : '');
      } else if (isGeneratingAnswer) {
        aEl.innerHTML =
          `<div style="display:flex;align-items:center;gap:8px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" style="animation:spin 1s linear infinite;flex-shrink:0"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span style="${P} font-size:16px;font-weight:700">thinking…</span>
           </div>`;
      } else {
        aEl.innerHTML =
          `<span style="color:rgba(255,255,255,0.35);font-size:15px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.9)">Waiting for a question…</span>`;
      }
    }

    // Interim
    const iEl = pip.document.getElementById('pip-interim');
    if (iEl) {
      iEl.innerHTML = interimText
        ? `<span style="color:rgba(255,255,255,0.5);font-size:14px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.9)">${interimText.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>` +
          `<span style="display:inline-block;width:2px;height:14px;background:rgba(255,255,255,0.4);margin-left:2px;vertical-align:middle;animation:blink 1s step-end infinite"></span>`
        : '';
    }

    // Auto-scroll
    const scrollEl = pip.document.getElementById('pip-scroll');
    if (scrollEl) {
      if (isGeneratingAnswer) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
        wasGenerating = true;
        userScrolled = false;
      } else if (wasGenerating) {
        wasGenerating = false;
        startReadingScroll();
      }
    }
  }

  // ── Code inner HTML ────────────────────────────────────────
  function buildCodeInner(): string {
    return `
      <div style="margin-bottom:14px">
        <p style="${P} font-size:14px;font-weight:700;margin:0 0 10px;line-height:1.5">
          Select the window with the coding question — CoachAI will read and solve it.
        </p>
        <button id="btn-scan" style="cursor:pointer;font-size:14px;font-weight:800;padding:10px 22px;border-radius:10px;border:1.5px solid rgba(34,211,238,0.5);background:rgba(0,0,0,0.5);color:#22d3ee;font-family:inherit;backdrop-filter:blur(4px)">
          📷 Scan Screen
        </button>
      </div>
      <div id="code-body">
        ${codeAnswer ? mdToHtml(codeAnswer) : `<span style="color:rgba(255,255,255,0.3);font-size:15px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.9)">Solution will appear here</span>`}
      </div>
    `;
  }

  async function onScanCode() {
    codeScanning = true;
    const btn = pip.document.getElementById('btn-scan') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = 'Capturing…'; }

    const codeBody = pip.document.getElementById('code-body');

    try {
      const base64 = await captureScreenshot();
      if (codeBody) codeBody.innerHTML = `<span style="${P} font-size:15px;font-weight:700">Analyzing…</span>`;

      const res = await fetch('/api/analyze-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, model }),
      });
      if (!res.ok || !res.body) throw new Error();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      codeAnswer = '';
      userScrolled = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const { token } = JSON.parse(data);
            codeAnswer += token;
            if (codeBody) {
              codeBody.innerHTML =
                mdToHtml(codeAnswer) +
                '<span style="display:inline-block;width:3px;height:18px;background:#22d3ee;margin-left:3px;vertical-align:middle;animation:blink 0.9s step-end infinite;border-radius:2px"></span>';
            }
            const scrollEl = pip.document.getElementById('pip-scroll');
            if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
          } catch {}
        }
      }

      if (codeBody) codeBody.innerHTML = mdToHtml(codeAnswer);
      startReadingScroll();

    } catch (err: any) {
      if (codeBody && err?.name !== 'NotAllowedError') {
        codeBody.innerHTML = `<span style="${P} font-size:15px">⚠️ Could not analyze. Try again.</span>`;
      }
    } finally {
      codeScanning = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '📷 Scan Screen'; }
    }
  }

  // ── Boot ──────────────────────────────────────────────────
  fullRender();

  const interval = pip.setInterval(() => {
    if (mode === 'answer') updateAnswerContent();
  }, 150);

  pip.addEventListener('pagehide', () => { pip.clearInterval(interval); stopScroll(); });
}

// ─── PiP Button ───────────────────────────────────────────────────────────────

export function PipButton() {
  const [pipOpen, setPipOpen] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const { setupData } = useSessionStore();

  const openPip = useCallback(async () => {
    if (!('documentPictureInPicture' in window)) {
      toast.error('Floating window requires Chrome 116+');
      return;
    }
    try {
      const pip = await (window as any).documentPictureInPicture.requestWindow({
        width: 460,
        height: 640,
        disallowReturnToOpener: false,
      });

      pipWindowRef.current = pip;
      setPipOpen(true);

      // Inject transparency FIRST into <head> before any paint — !important beats browser defaults
      const baseStyle = pip.document.createElement('style');
      baseStyle.textContent = `
        html, body, * { background: transparent !important; background-color: transparent !important; }
        html { height: 100%; }
        body { margin: 0; height: 100vh; overflow: hidden; color: white;
               font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
               position: relative; }
      `;
      pip.document.head.appendChild(baseStyle);

      const container = pip.document.createElement('div');
      container.style.cssText = 'width:100%;height:100%;position:relative;';
      pip.document.body.appendChild(container);

      renderPipContent(pip, container, setupData.model);

      pip.addEventListener('pagehide', () => {
        setPipOpen(false);
        pipWindowRef.current = null;
      });
    } catch {
      toast.error('Could not open floating window');
    }
  }, [setupData.model]);

  const closePip = useCallback(() => {
    pipWindowRef.current?.close();
    setPipOpen(false);
  }, []);

  return (
    <Button
      variant={pipOpen ? 'default' : 'outline'}
      size="sm"
      onClick={pipOpen ? closePip : openPip}
      title="Floating overlay — fully transparent, invisible when sharing a specific tab"
    >
      <PictureInPicture2 className="h-3.5 w-3.5 mr-1" />
      {pipOpen ? 'Close Float' : 'Float'}
    </Button>
  );
}

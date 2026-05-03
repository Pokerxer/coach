'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface FloatState {
  currentAnswer: string;
  isGeneratingAnswer: boolean;
  qaPairs: { id: string; question: string; answer: string }[];
  interimText: string;
  transcript: { id: string; text: string; timestamp: number }[];
  setupData?: { model?: string; interviewType?: string; jobTitle?: string; extraContext?: string };
}

// ─── Syntax highlighter (lightweight, no deps) ───────────────────────────────
const KEYWORDS: Record<string, string[]> = {
  js:   ['const','let','var','function','return','if','else','for','while','class','new','this','typeof','instanceof','import','export','default','async','await','try','catch','throw','break','continue','switch','case','null','undefined','true','false','of','in','from','extends'],
  ts:   ['const','let','var','function','return','if','else','for','while','class','new','this','typeof','instanceof','import','export','default','async','await','try','catch','throw','break','continue','switch','case','null','undefined','true','false','of','in','from','extends','type','interface','enum','as','implements','readonly','private','public','protected'],
  py:   ['def','return','if','elif','else','for','while','class','import','from','as','try','except','finally','raise','with','pass','break','continue','lambda','and','or','not','in','is','None','True','False','global','nonlocal','yield','async','await'],
  java: ['public','private','protected','class','interface','extends','implements','new','return','if','else','for','while','try','catch','finally','throw','throws','import','package','static','final','void','int','long','double','float','boolean','char','byte','short','null','true','false','this','super','abstract','synchronized'],
  cpp:  ['int','long','double','float','bool','char','void','class','struct','public','private','protected','return','if','else','for','while','new','delete','try','catch','throw','namespace','using','include','const','static','virtual','override','template','auto','nullptr','true','false'],
  sql:  ['SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','ON','GROUP','BY','ORDER','HAVING','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','INDEX','DROP','ALTER','ADD','COLUMN','AS','AND','OR','NOT','IN','IS','NULL','DISTINCT','COUNT','SUM','AVG','MAX','MIN','LIMIT','OFFSET','UNION','ALL'],
};
KEYWORDS.javascript = KEYWORDS.js;
KEYWORDS.typescript = KEYWORDS.ts;
KEYWORDS.python = KEYWORDS.py;

function highlight(code: string, lang: string): React.ReactNode[] {
  const kws = new Set((KEYWORDS[lang.toLowerCase()] || KEYWORDS.js).map(k => k.toLowerCase()));
  const nodes: React.ReactNode[] = [];
  // Tokenize: strings, comments, numbers, keywords, identifiers, rest
  const re = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|((?<!\w)\d+\.?\d*(?!\w))|([a-zA-Z_]\w*)|([+\-*/%=<>!&|^~?:;,.()\[\]{}\n])/g;
  let last = 0, m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) nodes.push(<span key={`t${last}`} className="text-[#e6edf3]">{code.slice(last, m.index)}</span>);
    if (m[1]) nodes.push(<span key={m.index} className="text-[#a5d6a7]">{m[1]}</span>);        // string → green
    else if (m[2]) nodes.push(<span key={m.index} className="text-[#6a737d] italic">{m[2]}</span>); // comment → gray
    else if (m[3]) nodes.push(<span key={m.index} className="text-[#f78c6c]">{m[3]}</span>);   // number → orange
    else if (m[4]) {
      const word = m[4];
      if (kws.has(word.toLowerCase()))
        nodes.push(<span key={m.index} className="text-[#c792ea] font-semibold">{word}</span>); // keyword → purple
      else if (code[m.index + word.length] === '(')
        nodes.push(<span key={m.index} className="text-[#82aaff]">{word}</span>);               // function call → blue
      else
        nodes.push(<span key={m.index} className="text-[#e6edf3]">{word}</span>);
    } else nodes.push(<span key={m.index} className="text-[#89ddff]">{m[5]}</span>);            // punctuation → cyan
    last = m.index + m[0].length;
  }
  if (last < code.length) nodes.push(<span key="tail" className="text-[#e6edf3]">{code.slice(last)}</span>);
  return nodes;
}

function CodeBlock({ lang, code, accent = 'cyan' }: { lang: string; code: string; accent?: 'cyan' | 'violet' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const lines = code.split('\n');
  const highlighted = highlight(code, lang);
  // Re-split highlighted nodes by line for line numbers
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-white/10 text-[12px]">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#161b22] px-3 py-1.5 border-b border-white/10">
        <span className={`font-mono text-[10px] uppercase tracking-widest ${accent === 'violet' ? 'text-violet-400/60' : 'text-cyan-400/60'}`}>{lang || 'code'}</span>
        <button onClick={copy} className="text-[10px] text-white/30 hover:text-white/60 transition-colors font-mono">
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
      {/* Code with line numbers */}
      <div className="flex bg-[#0d1117] overflow-x-auto">
        {/* Line numbers */}
        <div className="select-none text-right pr-3 pl-3 py-3 text-[11px] font-mono text-white/20 border-r border-white/5 shrink-0 leading-[1.7]">
          {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        {/* Highlighted code */}
        <pre className="flex-1 px-4 py-3 leading-[1.7] font-mono overflow-x-auto whitespace-pre">
          <code>{highlighted}</code>
        </pre>
      </div>
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
function MarkdownBlock({ text, streaming, accent = 'cyan' }: { text: string; streaming?: boolean; accent?: 'cyan' | 'violet' }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  const inline = (line: string) => {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[0].startsWith('**')) parts.push(<strong key={m.index} className="text-white font-bold">{m[2]}</strong>);
      else parts.push(<code key={m.index} className="bg-white/10 text-[#a5d6a7] px-1.5 py-0.5 rounded text-[0.85em] font-mono">{m[3]}</code>);
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];
    
    // Table (| col1 | col2 | or |---)
    const tableMatch = line.match(/^\|.+\|$/);
    if (tableMatch && !line.includes('---')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].match(/^\|.+\|$/)) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length > 0) {
        const rows = tableLines.map(row => row.split('|').filter(c => c.trim()));
        const tbody = rows.slice(1).map(row => (
          <tr key={i + row[0]}>
            {row.map((cell, c) => (
              <td key={c} className={`px-3 py-2 text-white/80 text-[20px] ${c === 0 ? 'font-medium' : ''} border-l border-white/10`}>
                {cell.trim()}
              </td>
            ))}
          </tr>
        ));
        nodes.push(
          <table key={i} className="w-full text-left border border-white/10 rounded my-2 overflow-hidden text-sm">
            <thead>
              <tr className="bg-white/5">
                {rows[0]?.map((h, c) => (
                  <th key={c} className="px-3 py-2.5 text-white/60 text-[20px] font-medium border-b border-white/10">
                    {h.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{tbody}</tbody>
          </table>
        );
      }
      continue;
    }
    
    // Skip |---| table separator
    if (line.match(/^\|?[-:]+\|/)) { i++; continue; }
    
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1] || 'js';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      nodes.push(<CodeBlock key={i} lang={lang} code={codeLines.join('\n')} accent={accent} />);
      i++; continue;
    }
    if (line.startsWith('### ')) { nodes.push(<p key={i} className="text-white font-bold text-[28px] mt-3 mb-1">{inline(line.slice(4))}</p>); i++; continue; }
    if (line.startsWith('## '))  { nodes.push(<p key={i} className="text-white font-black text-[30px] mt-4 mb-1 border-b border-white/10 pb-1">{inline(line.slice(3))}</p>); i++; continue; }
    if (line.startsWith('# '))   { nodes.push(<p key={i} className="text-white font-extrabold text-[32px] mt-4 mb-1">{inline(line.slice(2))}</p>); i++; continue; }
    const num = line.match(/^(\d+)\.\s+(.*)/);
    if (num) { nodes.push(<div key={i} className="flex gap-2 items-start my-1"><span className="text-cyan-400/50 font-mono text-[22px] mt-0.5 shrink-0 w-4 text-right">{num[1]}.</span><span className="text-white/85 text-[22px] leading-relaxed">{inline(num[2])}</span></div>); i++; continue; }
    const bul = line.match(/^[-*•]\s+(.*)/);
    if (bul) { nodes.push(<div key={i} className="flex gap-2 items-start my-1"><span className={`mt-1.5 shrink-0 text-[18px] ${accent === 'violet' ? 'text-violet-400/70' : 'text-cyan-400/70'}`}>▸</span><span className="text-white/85 text-[22px] leading-relaxed">{inline(bul[1])}</span></div>); i++; continue; }
    if (!line.trim()) { nodes.push(<div key={i} className="h-1.5" />); i++; continue; }
    nodes.push(<p key={i} className="text-white/85 text-[22px] leading-relaxed my-0.5">{inline(line)}</p>);
    i++;
  }

  const cursorColor = accent === 'violet' ? 'bg-violet-400' : 'bg-cyan-400';
  return (
    <div className="space-y-0.5">
      {nodes}
      {streaming && <span className={`inline-block w-[3px] h-[15px] ${cursorColor} ml-0.5 align-middle rounded-sm animate-[blink_0.9s_step-end_infinite]`} />}
    </div>
  );
}

// ─── Electron API type ─────────────────────────────────────────────────────
interface ElectronSource { id: string; name: string; thumbnail: string }
interface ElectronAPI {
  isElectron: boolean;
  listSources: () => Promise<ElectronSource[]>;
  captureSource: (sourceId: string) => Promise<string | null>;
  showOverlay: () => void;
  hideOverlay: () => void;
  toggleOverlay: () => void;
  setClickthrough: (enable: boolean) => void;
  overlayReady: () => void;
  verifyStealth: () => Promise<{ invisible: boolean; details: string }>;
  panicHide: () => void;
  showMain: () => void;
  minimizeOverlay: () => void;
}
function getElectronAPI(): ElectronAPI | null {
  const api = (window as any).electronAPI;
  return api?.isElectron ? api : null;
}

// ─── Screen capture (one-shot, used by interview scan-code) ──────────────────
async function captureScreenOnce(): Promise<string> {
  const eApi = getElectronAPI();
  if (eApi) {
    // Electron: capture primary screen
    const sources = await eApi.listSources();
    const screenSource = sources.find(s => s.id.startsWith('screen:'));
    if (screenSource) {
      const base64 = await eApi.captureSource(screenSource.id);
      if (base64) return base64;
    }
    throw new Error('No screen source available');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 } as any, audio: false });
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.srcObject = stream; video.muted = true;
    video.onloadedmetadata = async () => {
      await video.play();
      requestAnimationFrame(() => {
        const c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d')!.drawImage(video, 0, 0);
        stream.getTracks().forEach(t => t.stop());
        resolve(c.toDataURL('image/png').split(',')[1]);
      });
    };
    video.onerror = reject;
  });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FloatPage() {
  // ── Top-level mode: interview or exam ─────────────────────────────────────
  const [topMode, setTopMode] = useState<'interview' | 'exam'>('interview');

  // ── Interview state (received from session page via BroadcastChannel) ─────
  const [interviewTab, setInterviewTab] = useState<'answer' | 'code'>('answer');
  const [ivState, setIvState] = useState<FloatState>({
    currentAnswer: '', isGeneratingAnswer: false, qaPairs: [], interimText: '', transcript: [],
  });
  const [codeAnswer, setCodeAnswer] = useState('');
  const [codeScanning, setCodeScanning] = useState(false);

  // ── Exam state (fully self-contained inside float) ────────────────────────
  const [examSubject, setExamSubject]   = useState('');
  const [examCapturing, setExamCapturing] = useState(false);
  const [examStreaming, setExamStreaming]  = useState(false);
  const [examQuestion, setExamQuestion]   = useState('');
  const examQAHistoryRef = useRef<{ question: string; answer: string }[]>([]);
  const [examShareActive, setExamShareActive] = useState(false);
  const examStreamRef  = useRef<MediaStream | null>(null);
  const examVideoRef   = useRef<HTMLVideoElement | null>(null);
  const [examAnswer, setExamAnswer]       = useState('');
  const [autoCapture, setAutoCapture]     = useState(false);
  const [captureInterval, setCaptureInterval] = useState(15);
  const [countdown, setCountdown]         = useState(0);
  const [showSubjectInput, setShowSubjectInput] = useState(false);

  const autoCaptureRef    = useRef(false);
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownValRef   = useRef(0);

  // ── Shared ────────────────────────────────────────────────────────────────
  const [clickThrough, setClickThrough] = useState(false);
  const [isElectron, setIsElectron]     = useState(false);
  const [stealthStatus, setStealthStatus] = useState<'checking' | 'ok' | 'exposed' | 'idle'>('idle');

  const scrollRef          = useRef<HTMLDivElement>(null);
  const wasGeneratingRef   = useRef(false);
  const scrollTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolledRef    = useRef(false);
  const prevAnswerRef      = useRef('');

  useEffect(() => { setIsElectron(!!(window as any).electronAPI?.isElectron); }, []);

  // ── Stealth verification: self-test on mount, then every 30 s ─────────────
  const runStealthCheck = useCallback(async () => {
    const eApi = getElectronAPI();
    if (!eApi?.verifyStealth) return;
    setStealthStatus('checking');
    try {
      const result = await eApi.verifyStealth();
      setStealthStatus(result.invisible ? 'ok' : 'exposed');
      if (!result.invisible) console.warn('[stealth]', result.details);
    } catch { setStealthStatus('idle'); }
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    // Initial check after a short delay (let window settle)
    const initTimer = setTimeout(runStealthCheck, 3000);
    // Periodic re-verification every 30 seconds
    const periodic = setInterval(runStealthCheck, 30_000);
    return () => { clearTimeout(initTimer); clearInterval(periodic); };
  }, [isElectron, runStealthCheck]);

  // ── BroadcastChannel: receive interview state ─────────────────────────────
  useEffect(() => {
    const ch = new BroadcastChannel('parakeet-float');
    ch.onmessage = (e) => {
      if (e.data?.type === 'state') {
        const payload = e.data.payload as FloatState;
        setIvState(payload);
        // Auto-switch to exam mode when the session page is in exam mode
        if (payload.setupData?.interviewType === 'exam') setTopMode('exam');
        else if (payload.setupData?.interviewType && payload.setupData.interviewType !== 'exam') setTopMode('interview');
        if (payload.setupData?.jobTitle) setExamSubject(payload.setupData.jobTitle);
      }
    };
    ch.postMessage({ type: 'float-ready' });
    (window as any).electronAPI?.overlayReady?.();
    return () => ch.close();
  }, []);

  // ── Global shortcut: Cmd+Shift+C triggers exam capture from any window ───
  const examCaptureRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const eApi = (window as any).electronAPI;
    if (!eApi?.onCaptureShortcut) return;
    const handler = () => examCaptureRef.current?.();
    eApi.onCaptureShortcut(handler);
    return () => eApi.offCaptureShortcut(handler);
  }, []);

  // ── Auto-scroll helpers ───────────────────────────────────────────────────
  const stopReadingScroll = useCallback(() => {
    if (scrollTimerRef.current) { clearInterval(scrollTimerRef.current); scrollTimerRef.current = null; }
  }, []);

  const startReadingScroll = useCallback(() => {
    stopReadingScroll();
    userScrolledRef.current = false;
    scrollTimerRef.current = setInterval(() => {
      const el = scrollRef.current;
      if (!el || userScrolledRef.current) { stopReadingScroll(); return; }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) { stopReadingScroll(); return; }
      el.scrollTop += (18 * 80) / 1000;
    }, 80);
  }, [stopReadingScroll]);

  useEffect(() => {
    const { isGeneratingAnswer, currentAnswer } = ivState;
    const el = scrollRef.current;
    if (!el || topMode === 'exam') return;
    if (isGeneratingAnswer) {
      el.scrollTop = 0;           // jump to top so user reads from the question down
      wasGeneratingRef.current = true;
      userScrolledRef.current = false;
    } else if (wasGeneratingRef.current && currentAnswer !== prevAnswerRef.current) {
      wasGeneratingRef.current = false;
      prevAnswerRef.current = currentAnswer;
      startReadingScroll();
    }
  }, [ivState.isGeneratingAnswer, ivState.currentAnswer, topMode, startReadingScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => { userScrolledRef.current = true; stopReadingScroll(); };
    el.addEventListener('wheel', onScroll, { passive: true });
    el.addEventListener('touchmove', onScroll, { passive: true });
    return () => { el.removeEventListener('wheel', onScroll); el.removeEventListener('touchmove', onScroll); };
  }, [stopReadingScroll]);

  // ── Click-through ─────────────────────────────────────────────────────────
  const toggleClickthrough = () => {
    const next = !clickThrough;
    setClickThrough(next);
    (window as any).electronAPI?.setClickthrough(next);
  };

  // Sync click-through state toggled via Cmd+Shift+T global shortcut
  useEffect(() => {
    const eApi = (window as any).electronAPI;
    if (!eApi?.onClickthroughChanged) return;
    const handler = (val: boolean) => setClickThrough(val);
    eApi.onClickthroughChanged(handler);
    return () => eApi.offClickthroughChanged(handler);
  }, []);

  // ── Interview: scan code ──────────────────────────────────────────────────
  const scanCode = async () => {
    setCodeScanning(true);
    setCodeAnswer('');
    try {
      const base64 = await captureScreenOnce();
      const model  = ivState.setupData?.model ?? 'claude-sonnet';
      const res    = await fetch('/api/analyze-screen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, model }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let answer   = '';
      userScrolledRef.current = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6);
          if (d === '[DONE]') continue;
          try { const { token } = JSON.parse(d); answer += token; setCodeAnswer(answer); if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; } catch {}
        }
      }
      startReadingScroll();
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') setCodeAnswer('⚠️ Could not analyze screen.');
    } finally { setCodeScanning(false); }
  };

  // ── Exam: Electron source picker state ──────────────────────────────────
  const electronSourceRef = useRef<string | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [availableSources, setAvailableSources] = useState<ElectronSource[]>([]);

  // ── Exam: acquire browser stream (returns null if cancelled) ────────────
  const acquireBrowserExamStream = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080 }, audio: false,
      } as any);
      stream.getVideoTracks()[0].onended = () => {
        examStreamRef.current = null; examVideoRef.current = null; setExamShareActive(false);
      };
      const video = document.createElement('video');
      video.srcObject = stream; video.muted = true;
      await video.play();
      examStreamRef.current = stream; examVideoRef.current = video;
      setExamShareActive(true);
      return stream;
    } catch { return null; }
  }, []);

  // ── Exam: start / stop persistent screen share ──────────────────────────
  const startExamShare = useCallback(async () => {
    const eApi = getElectronAPI();
    if (eApi) {
      try {
        const sources = await eApi.listSources();
        setAvailableSources(sources);
        setShowSourcePicker(true);
      } catch (err: any) {
        if (err?.message?.includes('SCREEN_PERMISSION_DENIED')) {
          setExamQuestion('⚠️ Screen Recording permission required.\nSystem Preferences has been opened — enable it for this app, then restart.');
        }
      }
      return;
    }
    await acquireBrowserExamStream();
  }, [acquireBrowserExamStream]);

  const selectExamSource = useCallback((sourceId: string) => {
    electronSourceRef.current = sourceId;
    setShowSourcePicker(false);
    setExamShareActive(true);
  }, []);

  const stopExamShare = useCallback(() => {
    examStreamRef.current?.getTracks().forEach(t => t.stop());
    examStreamRef.current = null; examVideoRef.current = null;
    electronSourceRef.current = null;
    setExamShareActive(false);
  }, []);

  const grabExamFrame = useCallback(async (): Promise<string | null> => {
    const eApi = getElectronAPI();
    if (eApi && electronSourceRef.current) {
      return await eApi.captureSource(electronSourceRef.current);
    }
    const v = examVideoRef.current;
    if (!v || !examStreamRef.current?.active) return null;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  }, []);

  useEffect(() => () => { examStreamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  // ── Exam: single capture ──────────────────────────────────────────────────
  const examCapture = useCallback(async () => {
    if (examCapturing || examStreaming) return;

    const eApi = getElectronAPI();
    setExamCapturing(true);
    setExamQuestion('');
    setExamAnswer('');

    let base64: string | null = null;

    if (eApi) {
      if (!electronSourceRef.current) {
        setExamCapturing(false);
        const sources = await eApi.listSources();
        setAvailableSources(sources);
        setShowSourcePicker(true);
        return;
      }
      base64 = await eApi.captureSource(electronSourceRef.current);
    } else {
      // Browser: acquire stream if needed, then capture — one click
      if (!examStreamRef.current?.active) {
        const stream = await acquireBrowserExamStream();
        if (!stream) { setExamCapturing(false); return; }
      }
      base64 = await grabExamFrame();
    }

    if (!base64) { setExamCapturing(false); return; }

    setExamCapturing(false);
    setExamStreaming(true);
    setExamQuestion('Detecting question…');

    try {
      const res = await fetch('/api/exam/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          subject: examSubject || ivState.setupData?.jobTitle || '',
          context: ivState.setupData?.extraContext || '',
          model: ivState.setupData?.model || 'claude-sonnet',
          previousQA: examQAHistoryRef.current,
        }),
      });
      if (!res.ok || !res.body) throw new Error('Failed');

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let answer   = '';
      userScrolledRef.current = false;
      if (scrollRef.current) scrollRef.current.scrollTop = 0; // start from top

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'question') {
              setExamQuestion(evt.text);
            } else if (evt.token) {
              answer += evt.token;
              setExamAnswer(answer);
            }
          } catch {}
        }
      }
      // Store Q&A in history for context retention
      if (examQuestion && answer) {
        examQAHistoryRef.current.push({ question: examQuestion, answer });
      }
      startReadingScroll();
    } catch {
      setExamQuestion('Failed to analyze. Try again.');
    } finally { setExamStreaming(false); }
  }, [examCapturing, examStreaming, examSubject, ivState.setupData, startReadingScroll, startExamShare, grabExamFrame]);

  // Keep shortcut ref pointing to latest examCapture
  useEffect(() => { examCaptureRef.current = examCapture; }, [examCapture]);

  // ── Exam: auto-capture ────────────────────────────────────────────────────
  const startAuto = useCallback(() => {
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
      if (autoCaptureRef.current) examCapture();
    }, captureInterval * 1000);
  }, [captureInterval, examCapture]);

  const stopAuto = useCallback(() => {
    autoCaptureRef.current = false;
    setAutoCapture(false);
    setCountdown(0);
    if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current  = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  useEffect(() => () => { stopAuto(); }, []);

  const latestQ = ivState.qaPairs[ivState.qaPairs.length - 1]?.question ?? '';
  const busy    = examCapturing || examStreaming;

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden select-none" style={{ background: '#0A0A0F', opacity: clickThrough ? 0.45 : 1, transition: 'opacity 0.2s' }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
        body { margin: 0; background: #0A0A0F !important; }
      `}</style>

      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-b border-white/5"
        style={{ WebkitAppRegion: 'drag', cursor: 'grab' } as any}
        onMouseEnter={() => { if (clickThrough) (window as any).electronAPI?.setClickthrough(false); }}
        onMouseLeave={() => { if (clickThrough) (window as any).electronAPI?.setClickthrough(true); }}
      >
        {/* Traffic lights — always no-drag so clicks register */}
        <div className="flex gap-1.5 group" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {/* Red — hide window */}
          <span
            className="w-3 h-3 rounded-full bg-red-500 cursor-pointer flex items-center justify-center hover:bg-red-400 transition-colors"
            onClick={() => (window as any).electronAPI?.hideOverlay()}
            title="Hide  (⌘⇧Space to restore)"
          >
            <span className="hidden group-hover:block text-[7px] text-red-900 font-bold leading-none">✕</span>
          </span>
          {/* Yellow — minimize to dock */}
          <span
            className="w-3 h-3 rounded-full bg-yellow-500 cursor-pointer flex items-center justify-center hover:bg-yellow-400 transition-colors"
            onClick={() => (window as any).electronAPI?.minimizeOverlay()}
            title="Minimize to dock"
          >
            <span className="hidden group-hover:block text-[7px] text-yellow-900 font-bold leading-none">–</span>
          </span>
          {/* Green — live stealth indicator with self-verification */}
          <span
            onClick={runStealthCheck}
            className={`w-3 h-3 rounded-full cursor-pointer flex items-center justify-center transition-colors ${
              stealthStatus === 'ok'       ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.75)]' :
              stealthStatus === 'exposed'  ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.70)] animate-pulse' :
              stealthStatus === 'checking' ? 'bg-yellow-400 shadow-[0_0_4px_rgba(250,204,21,0.50)]' :
              isElectron                   ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.75)]' :
                                             'bg-green-500/30'
            }`}
            title={
              stealthStatus === 'ok'       ? 'Stealth VERIFIED — invisible to Zoom, Meet, Teams, OBS\nClick to re-verify' :
              stealthStatus === 'exposed'  ? '⚠️ EXPOSED — overlay may be visible to screen capture!\nClick to re-check' :
              stealthStatus === 'checking' ? 'Verifying stealth…' :
              isElectron                   ? 'Stealth active — click to verify' :
                                             'Stealth requires Electron app'
            }
          >
            {/* Shield icon on hover */}
            <span className="hidden group-hover:block text-[6px] text-green-900 font-bold leading-none">🛡</span>
          </span>
        </div>

        {/* Mode toggle — centred, no-drag */}
        <div className="flex items-center bg-white/5 rounded-lg p-0.5 gap-0.5 mx-auto" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => setTopMode('interview')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${topMode === 'interview' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/30 hover:text-white/50'}`}
          >
            🎤 Interview
          </button>
          <button
            onClick={() => { setTopMode('exam'); stopAuto(); }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${topMode === 'exam' ? 'bg-violet-500/20 text-violet-300' : 'text-white/30 hover:text-white/50'}`}
          >
            📖 Exam
          </button>
        </div>

        {/* Click-through toggle */}
        {isElectron && (
          <button
            onClick={toggleClickthrough}
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title={clickThrough ? 'Click-through ON — clicks pass to app below\n⌘⇧T to toggle' : 'Click-through OFF — window is interactive\n⌘⇧T to toggle'}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono font-bold transition-all ${
              clickThrough
                ? 'border-cyan-400/60 text-cyan-300 bg-cyan-400/15 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                : 'border-white/15 text-white/35 bg-white/5 hover:border-white/30 hover:text-white/55'
            }`}
          >
            {/* Simple eye icon: open = interactive, strikethrough = passthru */}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {clickThrough ? (
                // Eye with slash = passthru (clicks go through)
                <>
                  <path d="M1 6s1.5-3 5-3 5 3 5 3-1.5 3-5 3-5-3-5-3z" />
                  <circle cx="6" cy="6" r="1.2" fill="currentColor" stroke="none" />
                  <line x1="2" y1="2" x2="10" y2="10" strokeWidth="1.5" />
                </>
              ) : (
                // Open eye = interactive
                <>
                  <path d="M1 6s1.5-3 5-3 5 3 5 3-1.5 3-5 3-5-3-5-3z" />
                  <circle cx="6" cy="6" r="1.2" fill="currentColor" stroke="none" />
                </>
              )}
            </svg>
            <span>{clickThrough ? 'passthru' : 'focus'}</span>
          </button>
        )}
      </div>

      {/* ── Electron Source Picker (float) ── */}
      {showSourcePicker && (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-bold text-[13px]">Select window</span>
            <button onClick={() => setShowSourcePicker(false)} className="text-white/40 hover:text-white/60 text-[13px]">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2 flex-1">
            {availableSources.map((src) => (
              <button
                key={src.id}
                onClick={() => selectExamSource(src.id)}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl border border-white/10 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all"
              >
                <img src={src.thumbnail} alt={src.name} className="w-full rounded-lg border border-white/5" />
                <span className="text-white/60 text-[10px] truncate max-w-full">{src.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          EXAM MODE
      ══════════════════════════════════════════════════════════════════════ */}
      {topMode === 'exam' && (
        <>
          {/* Scrollable answer area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 pt-1 pb-2 space-y-2 min-h-0"
            onMouseEnter={() => { if (clickThrough) (window as any).electronAPI?.setClickthrough(false); }}
            onMouseLeave={() => { if (clickThrough) (window as any).electronAPI?.setClickthrough(true); }}
          >
            {examQuestion && examQuestion !== 'No question detected.' && (
              <div className="px-3 py-2 rounded-xl bg-violet-950/60 border border-violet-500/25">
                <p className="text-violet-400 text-[9px] font-bold uppercase tracking-widest mb-0.5">Question</p>
                <p className="text-white/80 text-[12px] leading-relaxed">{examQuestion}</p>
              </div>
            )}
            {examAnswer ? (
              <MarkdownBlock text={examAnswer} streaming={examStreaming} accent="violet" />
            ) : examStreaming ? (
              <div className="flex items-center gap-2 text-white/40 text-[13px] py-2">
                <Spinner className="text-violet-400" />thinking…
              </div>
            ) : !examQuestion ? (
              <div className="flex flex-col items-center justify-center h-28 gap-1.5 text-white/15">
                <span className="text-2xl">📖</span>
                <p className="text-[12px] font-semibold">Press Capture to get an answer</p>
                {isElectron && <p className="text-[10px] font-mono text-violet-400/30">⌘⇧C from anywhere</p>}
              </div>
            ) : examQuestion === 'No question detected.' ? (
              <p className="text-white/30 text-[12px] py-4 text-center">No question found. Try again.</p>
            ) : null}
          </div>

          {/* ── Sticky capture bar (always visible at bottom) ── */}
          <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/8 bg-[#08080d] space-y-2">
            {/* Subject + share status */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSubjectInput((v) => !v)}
                className="text-[10px] text-white/25 hover:text-white/45 transition-colors font-mono truncate max-w-[120px]"
              >
                {examSubject ? `📚 ${examSubject.slice(0, 18)}…` : '📚 subject…'}
              </button>
              <div className="ml-auto flex items-center gap-2">
                {autoCapture && countdown > 0 && (
                  <span className="text-violet-300/60 text-[10px] font-mono tabular-nums">{countdown}s</span>
                )}
                {examShareActive ? (
                  <button onClick={stopExamShare} className="flex items-center gap-1 text-[10px] font-mono text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    live
                    <span className="text-white/20 hover:text-red-400 ml-1">✕</span>
                  </button>
                ) : (
                  <button onClick={startExamShare} className="text-[10px] font-mono text-white/25 hover:text-white/45 transition-colors">
                    + connect screen
                  </button>
                )}
              </div>
            </div>

            {showSubjectInput && (
              <input
                value={examSubject}
                onChange={(e) => setExamSubject(e.target.value)}
                placeholder="Subject / course (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white placeholder:text-white/20 outline-none focus:border-violet-500/40"
                onBlur={() => setShowSubjectInput(false)}
                autoFocus
              />
            )}

            {/* Capture + Auto row */}
            <div className="flex gap-2">
              <button
                onClick={examCapture}
                disabled={busy}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold transition-all disabled:opacity-40 ${
                  busy
                    ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300'
                    : 'bg-violet-500/15 border border-violet-500/50 text-violet-200 hover:bg-violet-500/25 active:scale-[0.98]'
                }`}
              >
                {examCapturing ? (
                  <><Spinner className="text-violet-300" />Capturing…</>
                ) : examStreaming ? (
                  <><Spinner className="text-violet-300" />Analyzing…</>
                ) : (
                  <>
                    <span>📸 Capture &amp; Analyze</span>
                    {isElectron && <kbd className="text-[9px] text-violet-400/40 font-mono ml-1 bg-white/5 px-1 py-0.5 rounded">⌘⇧C</kbd>}
                  </>
                )}
              </button>

              <button
                onClick={autoCapture ? stopAuto : startAuto}
                disabled={!examShareActive && !autoCapture}
                className={`px-3 py-2.5 rounded-xl border text-[11px] font-bold transition-all ${
                  autoCapture
                    ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                    : examShareActive
                      ? 'border-white/10 bg-white/5 text-white/35 hover:text-white/55'
                      : 'border-white/5 text-white/15 cursor-not-allowed'
                }`}
              >
                {autoCapture ? '⏹' : '⟳'}
              </button>

              <select
                value={captureInterval}
                onChange={(e) => { setCaptureInterval(Number(e.target.value)); if (autoCapture) stopAuto(); }}
                className="bg-white/5 border border-white/10 text-white/35 text-[11px] rounded-xl px-2 py-2 outline-none"
              >
                {[5, 10, 15, 20, 30].map((s) => <option key={s} value={s}>{s}s</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          INTERVIEW MODE
      ══════════════════════════════════════════════════════════════════════ */}
      {topMode === 'interview' && (
        <>
          {/* Header row: generating indicator */}
          {ivState.isGeneratingAnswer && (
            <div className="flex items-center gap-1.5 px-3 pb-1 shrink-0">
              <Spinner className="text-cyan-400" />
              <span className="text-cyan-400/60 text-[11px]">generating…</span>
            </div>
          )}

          {/* Scrollable answer body */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 pb-2 min-h-0 space-y-2"
            onMouseEnter={() => { if (clickThrough) (window as any).electronAPI?.setClickthrough(false); }}
            onMouseLeave={() => { if (clickThrough) (window as any).electronAPI?.setClickthrough(true); }}
          >
            {latestQ && (
              <div className="px-3 py-2 rounded-lg bg-cyan-950/40 border border-cyan-500/20">
                <p className="text-cyan-300 text-[13px] font-bold leading-relaxed">{latestQ}</p>
              </div>
            )}
            {ivState.currentAnswer ? (
              <MarkdownBlock text={ivState.currentAnswer} streaming={ivState.isGeneratingAnswer} />
            ) : ivState.isGeneratingAnswer ? (
              <div className="flex items-center gap-2 text-white/40 text-[13px]"><Spinner className="text-cyan-400" />thinking…</div>
            ) : !codeAnswer ? (
              <p className="text-white/20 text-[13px] font-semibold">Waiting for a question…</p>
            ) : null}
            {ivState.interimText && (
              <p className="text-white/40 text-[12px] italic border-l-2 border-white/10 pl-2">
                {ivState.interimText}
                <span className="inline-block w-[2px] h-[13px] bg-white/30 ml-0.5 align-middle animate-[blink_1s_step-end_infinite] rounded-sm" />
              </p>
            )}
            {/* Screen capture answer appears inline below voice answer */}
            {codeAnswer && (
              <div className="border-t border-white/8 pt-2">
                <p className="text-[9px] text-white/25 font-mono uppercase tracking-widest mb-1.5">Screen capture</p>
                <MarkdownBlock text={codeAnswer} streaming={codeScanning} />
              </div>
            )}
          </div>

          {/* ── Sticky capture bar ── */}
          <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/8 bg-[#08080d]">
            <button
              onClick={scanCode}
              disabled={codeScanning}
              className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-bold transition-all disabled:opacity-40 ${
                codeScanning
                  ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-300'
                  : 'bg-cyan-500/15 border border-cyan-500/50 text-cyan-200 hover:bg-cyan-500/25 active:scale-[0.98]'
              }`}
            >
              {codeScanning ? <><Spinner className="text-cyan-400" />Analyzing…</> : <>📸 Capture &amp; Analyze</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 animate-spin shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

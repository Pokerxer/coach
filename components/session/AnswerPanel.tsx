'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/session';
import { Button } from '@/components/ui/button';
import { Copy, Check, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranscription } from '@/hooks/useTranscription';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

// ─── Markdown renderer ────────────────────────────────────────────────────────

type Token =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'inline-code'; value: string };

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', value: line.slice(last, m.index) });
    if (m[0].startsWith('**')) tokens.push({ type: 'bold', value: m[2] });
    else tokens.push({ type: 'inline-code', value: m[3] });
    last = m.index + m[0].length;
  }
  if (last < line.length) tokens.push({ type: 'text', value: line.slice(last) });
  return tokens;
}

function InlineTokens({ line }: { line: string }) {
  return (
    <>
      {tokenizeLine(line).map((t, i) => {
        if (t.type === 'bold') return <strong key={i} className="text-white font-semibold">{t.value}</strong>;
        if (t.type === 'inline-code') return (
          <code key={i} className="bg-white/10 text-cyan-300 px-1.5 py-0.5 rounded text-[0.8em] font-mono">
            {t.value}
          </code>
        );
        return <span key={i}>{t.value}</span>;
      })}
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-white/10 bg-[#0d1117]">
      {/* Code block header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
        <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">
          {lang || 'code'}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white/70 transition-colors"
        >
          {copied
            ? <><Check className="h-3 w-3 text-green-400" /> copied</>
            : <><Copy className="h-3 w-3" /> copy</>}
        </button>
      </div>
      {/* Code body */}
      <pre className="overflow-x-auto px-4 py-4 text-[0.8rem] leading-relaxed font-mono">
        <code>
          {code.split('\n').map((line, i) => (
            <div key={i} className="flex">
              <span className="select-none text-white/20 w-8 shrink-0 text-right mr-4 text-[0.75rem]">
                {i + 1}
              </span>
              <span className="text-[#e6edf3]">{highlightCode(line)}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

// Simple keyword-based syntax colouring (no external dependency)
function highlightCode(line: string): React.ReactNode {
  const patterns: [RegExp, string][] = [
    // Strings
    [/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, 'text-[#a5d6ff]'],
    // Comments
    [/(\/\/.*|\/\*[\s\S]*?\*\/#?)/g, 'text-[#8b949e] italic'],
    // Keywords
    [/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|typeof|instanceof|default|switch|case|break|continue|try|catch|finally|throw|null|undefined|true|false|void|type|interface|extends|implements)\b/g, 'text-[#ff7b72]'],
    // Numbers
    [/\b(\d+\.?\d*)\b/g, 'text-[#79c0ff]'],
    // Function calls
    [/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, 'text-[#d2a8ff]'],
    // Properties / methods after dot
    [/\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, 'text-[#79c0ff]'],
  ];

  // Fall back to plain text — simple single-pass
  // For a streaming answer we keep it lightweight without a real AST
  let result = line;
  const parts: { text: string; cls: string }[] = [];

  // Split by tokens we recognise
  const combined = new RegExp(patterns.map(([r]) => r.source).join('|'), 'g');
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = combined.exec(line)) !== null) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index), cls: '' });
    let cls = '';
    for (const [re, c] of patterns) {
      re.lastIndex = 0;
      if (re.test(m[0])) { cls = c; break; }
    }
    parts.push({ text: m[0], cls });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), cls: '' });

  if (parts.length === 0) return line;

  return (
    <>
      {parts.map((p, i) =>
        p.cls
          ? <span key={i} className={p.cls}>{p.text}</span>
          : <span key={i}>{p.text}</span>
      )}
    </>
  );
}

function MarkdownAnswer({ text, streaming }: { text: string; streaming?: boolean }) {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      const lang = fenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      // Only render complete blocks (or partial if streaming)
      if (codeLines.length > 0) {
        nodes.push(<CodeBlock key={i} lang={lang} code={codeLines.join('\n')} />);
      }
      i++;
      continue;
    }

    // H3 heading
    if (line.startsWith('### ')) {
      nodes.push(
        <p key={i} className="text-white font-semibold text-sm mt-3 mb-1">
          <InlineTokens line={line.slice(4)} />
        </p>
      );
      i++; continue;
    }

    // H2 heading
    if (line.startsWith('## ')) {
      nodes.push(
        <p key={i} className="text-white font-bold text-sm mt-4 mb-1 border-b border-white/10 pb-1">
          <InlineTokens line={line.slice(3)} />
        </p>
      );
      i++; continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      nodes.push(
        <div key={i} className="flex gap-2.5 items-start">
          <span className="text-cyan-400/50 font-mono text-xs mt-0.5 shrink-0 w-4 text-right">
            {numMatch[1]}.
          </span>
          <span className="text-white/85 text-sm leading-relaxed">
            <InlineTokens line={numMatch[2]} />
          </span>
        </div>
      );
      i++; continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^[-*•]\s+(.*)/);
    if (bulletMatch) {
      nodes.push(
        <div key={i} className="flex gap-2.5 items-start">
          <span className="text-cyan-400/60 mt-1.5 shrink-0 text-xs">▸</span>
          <span className="text-white/85 text-sm leading-relaxed">
            <InlineTokens line={bulletMatch[1]} />
          </span>
        </div>
      );
      i++; continue;
    }

    // Blank line → small gap
    if (!line.trim()) {
      nodes.push(<div key={i} className="h-2" />);
      i++; continue;
    }

    // Normal paragraph
    nodes.push(
      <p key={i} className="text-white/85 text-sm leading-relaxed">
        <InlineTokens line={line} />
      </p>
    );
    i++;
  }

  return (
    <div className="space-y-1.5">
      {nodes}
      {streaming && (
        <span className="inline-block w-0.5 h-4 bg-cyan-400 ml-0.5 align-middle animate-pulse" />
      )}
    </div>
  );
}

// ─── Collapsed past Q&A card ──────────────────────────────────────────────────

function PastQA({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-white/8 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-cyan-400/40 font-mono text-[10px] mt-0.5 shrink-0">Q{index}</span>
        <span className="text-white/50 text-xs leading-relaxed flex-1 line-clamp-1">{question}</span>
        {open ? <ChevronUp className="h-3 w-3 text-white/25 shrink-0 mt-0.5" />
               : <ChevronDown className="h-3 w-3 text-white/25 shrink-0 mt-0.5" />}
      </button>
      {open && (
        <div className="border-t border-white/8 bg-white/[0.02]">
          <div className="px-4 pt-3 pb-1">
            <MarkdownAnswer text={answer} />
          </div>
          <div className="flex justify-end px-3 pb-2">
            <button onClick={copy} className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">
              {copied ? <><Check className="h-3 w-3 text-green-400" />copied</> : <><Copy className="h-3 w-3" />copy</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AnswerPanel() {
  const { currentAnswer, isGeneratingAnswer, qaPairs } = useSessionStore();
  const { generateAnswer } = useTranscription();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [customQ, setCustomQ] = useState('');

  const completedPairs = qaPairs.slice(0, -1).filter((p) => p.answer);
  const current = qaPairs[qaPairs.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentAnswer]);

  const copyAnswer = () => {
    navigator.clipboard.writeText(currentAnswer);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const sendCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQ.trim()) return;
    await generateAnswer(customQ.trim());
    setCustomQ('');
  };

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-xs font-mono text-white/40 uppercase tracking-widest">AI Answer</span>
          {isGeneratingAnswer && <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />}
        </div>
        {currentAnswer && !isGeneratingAnswer && (
          <Button variant="ghost" size="sm" onClick={copyAnswer} className="h-7 px-2 gap-1.5 text-xs">
            {copied ? <><Check className="h-3.5 w-3.5 text-green-400" />Copied</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* Collapsed history */}
        {completedPairs.length > 0 && (
          <div className="space-y-1.5">
            {completedPairs.map((p, i) => (
              <PastQA key={p.id} question={p.question} answer={p.answer} index={i + 1} />
            ))}
          </div>
        )}

        {/* Active answer */}
        {(current || isGeneratingAnswer) ? (
          <div className={cn(
            'rounded-xl border p-4 space-y-3',
            isGeneratingAnswer ? 'border-cyan-500/25 bg-cyan-950/20' : 'border-white/10 bg-white/[0.03]'
          )}>
            {current?.question && (
              <p className="text-xs text-cyan-400/80 border-l-2 border-cyan-500/40 pl-2 leading-relaxed font-medium">
                {current.question}
              </p>
            )}
            {currentAnswer ? (
              <MarkdownAnswer text={currentAnswer} streaming={isGeneratingAnswer} />
            ) : isGeneratingAnswer ? (
              <div className="flex items-center gap-2 text-white/35 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                thinking…
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <p className="text-white/25 text-xs text-center leading-relaxed">
              Answers stream here as questions are detected
              <br />
              <span className="text-white/15">Space — trigger manually</span>
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Custom question */}
      <form onSubmit={sendCustom} className="border-t border-white/10 p-3 flex gap-2 shrink-0">
        <input
          value={customQ}
          onChange={(e) => setCustomQ(e.target.value)}
          placeholder="Type a question to answer…"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan-500/40 transition-colors"
        />
        <Button type="submit" size="sm" disabled={!customQ.trim() || isGeneratingAnswer}>
          Ask
        </Button>
      </form>
    </div>
  );
}

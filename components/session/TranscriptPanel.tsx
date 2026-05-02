'use client';

import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/store/session';
import { cn } from '@/lib/utils';

export function TranscriptPanel() {
  const { transcript, interimText, isRecording, isGeneratingAnswer } = useSessionStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimText]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <span className="text-xs font-mono text-white/40 uppercase tracking-widest">Transcript</span>
        <div className="ml-auto flex items-center gap-3">
          {isGeneratingAnswer && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs text-cyan-400/60">answering</span>
            </span>
          )}
          {isRecording && !isGeneratingAnswer && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-white/30">listening</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
        {transcript.length === 0 && !interimText ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-white/25 text-xs text-center leading-relaxed">
              {isRecording
                ? 'Listening — speak or play audio near the mic'
                : 'Press Start Recording, then speak or play a question'}
            </p>
          </div>
        ) : (
          transcript.map((line, i) => {
            const isLatest = i === transcript.length - 1 && !interimText;
            return (
              <div
                key={line.id}
                className={cn(
                  'leading-relaxed transition-colors duration-500',
                  'animate-in slide-in-from-bottom-1 duration-200',
                  isLatest ? 'text-white' : 'text-white/50'
                )}
              >
                <span className="text-white/20 text-[10px] mr-2 font-mono tabular-nums">
                  {new Date(line.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                {line.text}
              </div>
            );
          })
        )}

        {/* Live text — appears character by character as Mac speech recognition processes */}
        {interimText && (
          <div className="leading-relaxed text-white/40 border-l-2 border-white/10 pl-2 animate-in slide-in-from-bottom-1 duration-100">
            <span className="text-white/15 text-[10px] mr-2 font-mono">now</span>
            {interimText}
            <span className="inline-block w-0.5 h-3.5 bg-white/30 ml-0.5 align-middle animate-pulse" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

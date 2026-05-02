'use client';

import { use } from 'react';
import { useSessionStore } from '@/store/session';
import { useSession } from '@/hooks/useSession';
import { TranscriptPanel } from '@/components/session/TranscriptPanel';
import { AnswerPanel } from '@/components/session/AnswerPanel';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Square, Zap } from 'lucide-react';

export default function MobileSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isRecording, isMuted } = useSessionStore();
  const { startSession, stopSession, toggleMute, triggerManual } = useSession(id);

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0F] overflow-hidden">
      {/* Transcript (top half) */}
      <div className="flex-1 border-b border-white/10 overflow-hidden">
        <TranscriptPanel />
      </div>

      {/* Answer (bottom half) */}
      <div className="flex-1 overflow-hidden">
        <AnswerPanel />
      </div>

      {/* Compact controls */}
      <div className="flex items-center gap-2 p-3 border-t border-white/10 bg-[#0A0A0F]">
        <Button size="icon" variant="outline" onClick={toggleMute} disabled={!isRecording}>
          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="outline" onClick={triggerManual} disabled={!isRecording} className="flex-1">
          <Zap className="h-3.5 w-3.5 mr-1 text-cyan-400" />
          Answer
        </Button>
        {!isRecording ? (
          <Button size="sm" onClick={startSession} className="flex-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 mr-2 animate-pulse" />
            Start
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={stopSession} className="flex-1">
            <Square className="h-3.5 w-3.5 fill-current mr-1" />
            End
          </Button>
        )}
      </div>
    </div>
  );
}

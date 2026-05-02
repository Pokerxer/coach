'use client';

import { useSessionStore } from '@/store/session';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Square, Zap, Code2, PictureInPicture2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// In Electron: triggers the native protected overlay window.
// In browser: opens /float as a popup (invisible when sharing a specific tab).
function FloatButton() {
  const open = () => {
    const api = (window as any).electronAPI;
    if (api?.isElectron) {
      api.showOverlay();
    } else {
      window.open(
        '/float',
        'coachfloat',
        'width=460,height=640,resizable=yes,scrollbars=no,toolbar=no,location=no,status=no,menubar=no'
      );
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={open} title="Open invisible overlay (hidden from screen capture in Electron)">
      <PictureInPicture2 className="h-3.5 w-3.5 mr-1" />
      Float
    </Button>
  );
}

interface SessionControlsProps {
  onStop: () => void;
  onToggleMute: () => void;
  onTriggerManual: () => void;
  onStart: () => void;
}

export function SessionControls({ onStop, onToggleMute, onTriggerManual, onStart }: SessionControlsProps) {
  const { isRecording, isMuted, codingMode, setCodingMode } = useSessionStore();

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#0A0A0F]">
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/30 font-mono hidden sm:block">
          Space: answer · ⌘M: mute · ⌘E: end · ⌘⇧S: stealth
        </span>
      </div>

      <div className="flex items-center gap-3">
        <FloatButton />

        {/* Coding mode */}
        <Button
          variant={codingMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCodingMode(!codingMode)}
          className="text-xs"
        >
          <Code2 className="h-3.5 w-3.5 mr-1" />
          Coding
        </Button>

        {/* Manual trigger */}
        <Button
          variant="outline"
          size="sm"
          onClick={onTriggerManual}
          disabled={!isRecording}
          className="text-xs"
        >
          <Zap className="h-3.5 w-3.5 mr-1 text-cyan-400" />
          Answer Now
        </Button>

        {/* Mute */}
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleMute}
          disabled={!isRecording}
          className={cn(isMuted && 'border-red-500/50 text-red-400')}
        >
          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>

        {/* Start / Stop */}
        {!isRecording ? (
          <Button onClick={onStart} className="gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Start Recording
          </Button>
        ) : (
          <Button variant="destructive" onClick={onStop} className="gap-2">
            <Square className="h-3.5 w-3.5 fill-current" />
            End Session
          </Button>
        )}
      </div>
    </div>
  );
}

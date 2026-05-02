'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/session';
import { Badge } from '@/components/ui/badge';
import { formatDuration } from '@/lib/utils';
import { Clock } from 'lucide-react';

export function SessionHeader() {
  const { setupData, startedAt, isRecording } = useSessionStore();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || !isRecording) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isRecording]);

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0A0A0F]">
      <div className="flex items-center gap-3">
        {isRecording && (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-400 font-mono">LIVE</span>
          </div>
        )}
        <div className="text-sm text-white/70 truncate max-w-sm">
          {setupData.jobTitle && setupData.companyName
            ? `${setupData.jobTitle} @ ${setupData.companyName}`
            : setupData.jobTitle || 'Live Session'}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="flex items-center gap-1 font-mono">
          <Clock className="h-3 w-3" />
          {formatDuration(elapsed)}
        </Badge>
        <Badge variant="outline" className="text-xs capitalize">
          {setupData.model}
        </Badge>
      </div>
    </div>
  );
}

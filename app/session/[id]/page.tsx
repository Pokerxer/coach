'use client';

import { use, useEffect, useRef } from 'react';
import { useSessionStore } from '@/store/session';
import { useSession } from '@/hooks/useSession';
import { SessionHeader } from '@/components/session/SessionHeader';
import { TranscriptPanel } from '@/components/session/TranscriptPanel';
import { AnswerPanel } from '@/components/session/AnswerPanel';
import { SessionControls } from '@/components/session/SessionControls';
import { CodingMode } from '@/components/session/CodingMode';
import { StealthModeWrapper } from '@/components/session/StealthMode';

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
  const { codingMode } = useSessionStore();
  const { startSession, stopSession, toggleMute, triggerManual } = useSession(id);
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
        />
      </div>
    </StealthModeWrapper>
  );
}

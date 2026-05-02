'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/store/session';
import { Camera, Loader2 } from 'lucide-react';
import { SyntaxHighlighter } from './SyntaxHighlighter';
import toast from 'react-hot-toast';

export function CodingMode() {
  const { setupData, appendCurrentAnswer, setCurrentAnswer, setIsGeneratingAnswer, isGeneratingAnswer, addQAPair } =
    useSessionStore();
  const [capturing, setCapturing] = useState(false);

  const captureAndAnalyze = useCallback(async () => {
    setCapturing(true);
    try {
      // Capture screen
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop();
      stream.getTracks().forEach((t) => t.stop());

      // Convert to base64
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const base64 = canvas.toDataURL('image/png').split(',')[1];

      // Send for analysis
      setIsGeneratingAnswer(true);
      setCurrentAnswer('');
      const pairId = crypto.randomUUID();
      addQAPair({ id: pairId, question: '[Screenshot coding question]', answer: '', timestamp: Date.now() });

      const res = await fetch('/api/coding-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, model: setupData.model }),
      });

      if (!res.body) throw new Error('No stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const { token } = JSON.parse(data);
              appendCurrentAnswer(token);
              fullAnswer += token;
            } catch {}
          }
        }
      }
      useSessionStore.getState().updateLastAnswer(fullAnswer);
    } catch (err) {
      toast.error('Screenshot capture failed');
    } finally {
      setCapturing(false);
      setIsGeneratingAnswer(false);
    }
  }, [setupData.model]);

  return (
    <div className="flex items-center gap-2 p-3 border-t border-yellow-500/20 bg-yellow-500/5">
      <span className="text-xs text-yellow-400 font-mono">CODING MODE</span>
      <Button
        size="sm"
        variant="outline"
        onClick={captureAndAnalyze}
        disabled={capturing || isGeneratingAnswer}
        className="border-yellow-500/30 text-yellow-400 text-xs ml-auto"
      >
        {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Camera className="h-3.5 w-3.5 mr-1" />}
        Capture Screen
      </Button>
    </div>
  );
}

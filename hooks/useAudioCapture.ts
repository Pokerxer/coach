'use client';

import { useRef, useCallback } from 'react';

interface UseAudioCaptureOptions {
  onChunk: (blob: Blob, mimeType: string) => void;
  timeslice?: number; // ms between chunks
}

export function useAudioCapture({ onChunk, timeslice = 3000 }: UseAudioCaptureOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // Pick the first supported MIME type (Safari needs mp4, Chrome/Firefox prefer webm)
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        onChunk(e.data, mimeType);
      }
    };

    recorder.start(timeslice);
    return recorder;
  }, [onChunk, timeslice]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    streamRef.current = null;
  }, []);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
  }, []);

  return { start, stop, pause, resume };
}

'use client';

import { useCallback, useRef } from 'react';
import { useSessionStore } from '@/store/session';

// How many lines of recent transcript to send as context
const CONTEXT_WINDOW = 6;

// ── Strong local question detector — no LLM round-trip needed ────────────────
// Returns null if definitely not a question, otherwise returns the cleaned text
function localDetectQuestion(text: string): string | null {
  const t = text.trim();
  if (t.length < 5) return null;

  const lower = t.toLowerCase();

  // Ends with a question mark — almost always a question
  if (t.endsWith('?')) return t;

  // Starts with a clear question word/phrase
  const QUESTION_STARTERS = [
    /^(what|where|when|why|who|which|how|whose|whom)\b/,
    /^(can you|could you|would you|will you|do you|did you|have you|are you|were you|is there|are there)\b/,
    /^(tell me|describe|explain|walk me through|talk me through|give me an example|share|define)\b/,
    /^(let's talk about|let's discuss|i'd like to (know|hear|understand))\b/,
  ];
  for (const re of QUESTION_STARTERS) {
    if (re.test(lower)) return t;
  }

  // Contains a strong interview signal word
  const SIGNAL_WORDS = [
    /\b(tell us|tell me) (about|me about|us about)\b/,
    /\b(your (experience|background|strengths?|weaknesses?|skills?|approach|process|opinion|thoughts?))\b/,
    /\b(how (do|did|would|have) you)\b/,
    /\b(what (is|are|was|were|would|did|do) you(r)?)\b/,
    /\b(describe (a time|an example|your|how|when))\b/,
    /\b(have you (ever|worked|used|dealt|handled|built|designed|implemented|led|managed))\b/,
    /\b(walk (me|us) through)\b/,
    /\b(give (me|us) an? (example|instance|time|situation|case))\b/,
    /\b(why (do|did|would|are|is) you)\b/,
    /\b(what (challenges?|difficulties|problems?|issues?) (have you|did you|do you))\b/,
    /\b(where do you see)\b/,
    /\b(what (motivates?|drives?|excites?) you)\b/,
  ];
  for (const re of SIGNAL_WORDS) {
    if (re.test(lower)) return t;
  }

  return null; // not a question
}

export function useTranscription() {
  const answerQueueRef     = useRef<string[]>([]);   // questions waiting to be answered
  const isAnsweringRef     = useRef(false);          // true while streaming an answer
  const lastAnswerStartRef = useRef<number>(0);      // cooldown anchor
  const lastQuestionRef    = useRef<string>('');     // dedup

  // ── Core answer streamer ─────────────────────────────────────────────────
  const generateAnswer = useCallback(async (question: string) => {
    const {
      setupData, sessionId, qaPairs,
      addQAPair, setCurrentAnswer, appendCurrentAnswer,
      setIsGeneratingAnswer, updateLastAnswer,
    } = useSessionStore.getState();

    lastAnswerStartRef.current = Date.now();
    lastQuestionRef.current    = question.toLowerCase().trim();
    isAnsweringRef.current     = true;

    setIsGeneratingAnswer(true);
    setCurrentAnswer('');
    addQAPair({ id: crypto.randomUUID(), question, answer: '', timestamp: Date.now() });

    const history = qaPairs
      .filter((p) => p.answer)
      .slice(-8)
      .map((p) => ({ question: p.question, answer: p.answer }));

    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          model: setupData.model,
          resumeText: setupData.resumeText,
          jobTitle: setupData.jobTitle,
          companyName: setupData.companyName,
          jobDescription: setupData.jobDescription,
          extraContext: setupData.extraContext,
          interviewType: setupData.interviewType,
          history,
        }),
      });

      if (!res.ok || !res.body) return;

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const { token } = JSON.parse(data);
            appendCurrentAnswer(token);
            fullAnswer += token;
          } catch {}
        }
      }

      updateLastAnswer(fullAnswer);

      if (sessionId) {
        fetch(`/api/sessions/${sessionId}/qa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer: fullAnswer }),
        }).catch(() => {});
      }
    } finally {
      setIsGeneratingAnswer(false);
      isAnsweringRef.current = false;

      // Drain the next queued question if any
      if (answerQueueRef.current.length > 0) {
        const next = answerQueueRef.current.shift()!;
        generateAnswer(next);
      }
    }
  }, []);

  // ── Queue-based question handler ─────────────────────────────────────────
  // Every detected question goes through here. If we're busy, it queues.
  const enqueueAnswer = useCallback((question: string) => {
    const norm = question.toLowerCase().trim();

    // Dedup: same or near-identical question already queued/answering
    if (norm === lastQuestionRef.current) return;
    if (answerQueueRef.current.some(q => q.toLowerCase() === norm)) return;

    if (isAnsweringRef.current) {
      // Keep queue bounded — if queue has 2+ items, replace the last (old questions go stale)
      if (answerQueueRef.current.length >= 2) {
        answerQueueRef.current[answerQueueRef.current.length - 1] = question;
      } else {
        answerQueueRef.current.push(question);
      }
    } else {
      generateAnswer(question);
    }
  }, [generateAnswer]);

  // ── Called after each new transcript line ────────────────────────────────
  const checkAndAnswer = useCallback(async (newText: string) => {
    const { transcript } = useSessionStore.getState();

    // Build context from recent lines (prioritise latest speech)
    const freshLines = transcript
      .slice(-CONTEXT_WINDOW)
      .map((l) => l.text);

    // Ensure the new line is included
    if (!freshLines.includes(newText)) freshLines.push(newText);
    const context = freshLines.join(' ').trim();

    // 1. Fast local check — no network call
    const localResult = localDetectQuestion(context);
    if (localResult) {
      enqueueAnswer(localResult);
      return;
    }

    // 2. Fallback: short LLM call only if local heuristic was uncertain
    //    Skip if already answering (don't pile on API calls)
    if (isAnsweringRef.current) return;

    // Min gap between LLM detect calls (not answer calls)
    if (Date.now() - lastAnswerStartRef.current < 1500) return;

    try {
      const res = await fetch('/api/detect-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk: context }),
      });
      if (!res.ok) return;
      const { isQuestion, question } = await res.json();
      if (isQuestion && question?.trim()) enqueueAnswer(question);
    } catch {}
  }, [enqueueAnswer]);

  return { generateAnswer, checkAndAnswer };
}

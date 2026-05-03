'use client';

import { useCallback, useRef } from 'react';
import { useSessionStore } from '@/store/session';

// ── Question detector ─────────────────────────────────────────────────────────
// Operates on a SINGLE transcript line (not multi-line context blobs).
// Returns the extracted question text, or null.
//
// Design principles:
//  • Check only the new line (not accumulated context) → dedup works reliably
//  • Extract just the question sentence when a line has trailing content
//  • Require patterns that imply the question is DIRECTED AT the candidate
//  • Avoid "What is X? X is Y" — the interviewer asks & answers themselves

function extractQuestion(line: string): string | null {
  const t = line.trim();
  if (t.length < 8 || t.length > 400) return null;

  const lower = t.toLowerCase();

  // ── Lines ending with '?' ─────────────────────────────────────────────────
  if (t.endsWith('?')) {
    // If the line has multiple sentences, take just the last question sentence
    // e.g. "Webpack is a bundler. What is it used for?" → "What is it used for?"
    const sentences = t.split(/(?<=[.!?])\s+/);
    const lastQ = sentences[sentences.length - 1];
    if (lastQ.endsWith('?') && lastQ.length >= 8) return lastQ;
    return t;
  }

  // ── Lines that CONTAIN a '?' mid-sentence ─────────────────────────────────
  // e.g. "What is it used for? Webpack is a module bundler that..."
  // → extract "What is it used for?" and check it's directed at the candidate
  const questionIdx = t.indexOf('?');
  if (questionIdx > 7) {
    const questionPart = t.slice(0, questionIdx + 1).trim();
    const qLower = questionPart.toLowerCase();
    const isDirected =
      /\b(you|your|have you|can you|could you|would you|tell me|tell us|describe|explain|walk)\b/.test(qLower);
    if (isDirected) return questionPart;
  }

  // ── Directed interview patterns (no '?' required) ─────────────────────────
  // These patterns only match questions clearly directed AT the candidate.

  // Must START with a directing phrase
  const DIRECTED_STARTERS: RegExp[] = [
    /^(can you|could you|would you|will you)\b/,
    /^(tell me|tell us)\b/,
    /^(describe|explain|walk me through|walk us through|talk me through)\b/,
    /^(give me|give us) an?\b/,
    /^(i('d| would) like (to hear|you to|to know))\b/,
  ];
  for (const re of DIRECTED_STARTERS) {
    if (re.test(lower)) return t;
  }

  // Signal phrases that imply the question is aimed at YOU
  const DIRECTED_SIGNALS: RegExp[] = [
    /\b(how (do|did|would|have) you)\b/,
    /\b(what (is|are|was|were|would|do|did) you(r)?)\b/,
    /\b(your (experience|background|strengths?|weaknesses?|skills?|approach|process|thoughts?|opinion))\b/,
    /\b(describe (a time|an example|your|how|when) you)\b/,
    /\b(have you (ever|worked|used|built|designed|implemented|led|managed))\b/,
    /\b(why (do|did|would|are) you)\b/,
    /\b(tell me about (your|a time|an example))\b/,
    /\b(walk (me|us) through (your|a |an ))\b/,
    /\b(what (motivates?|drives?|excites?) you)\b/,
    /\b(where do you see yourself)\b/,
    /\b(what('s| is) (the hardest|a challenge|a time) (you|when you))\b/,
  ];
  for (const re of DIRECTED_SIGNALS) {
    if (re.test(lower)) return t;
  }

  return null;
}

// Jaccard similarity on word sets — used for dedup of near-identical questions
function wordSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wa.size === 0 && wb.size === 0) return 1;
  let inter = 0;
  wa.forEach(w => { if (wb.has(w)) inter++; });
  return inter / (wa.size + wb.size - inter);
}

export function useTranscription() {
  const answerQueueRef      = useRef<string[]>([]);  // questions waiting to be answered
  const isAnsweringRef      = useRef(false);         // true while streaming
  const lastAnswerStartRef  = useRef<number>(0);     // anchor for LLM detect cooldown
  const lastQuestionRef     = useRef<string>('');    // last queued/answered question
  const lastAnswerEndRef    = useRef<number>(0);     // when the last answer finished

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
    // Display only the clean question sentence in the panel (not context)
    addQAPair({ id: crypto.randomUUID(), question, answer: '', timestamp: Date.now() });

    // Include recent transcript lines as extra context for Claude (not shown in UI)
    const { transcript } = useSessionStore.getState();
    const recentContext = transcript.slice(-5).map(l => l.text).join('\n');

    const history = qaPairs
      .filter((p) => p.answer)
      .slice(-8)
      .map((p) => ({ question: p.question, answer: p.answer }));

    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Send the clean question to the API; prepend transcript context separately
          question: recentContext
            ? `[Conversation context — for background only, do not repeat]\n${recentContext}\n\n[Question being asked]\n${question}`
            : question,
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
      lastAnswerEndRef.current = Date.now();

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

      // Drain next queued question
      if (answerQueueRef.current.length > 0) {
        const next = answerQueueRef.current.shift()!;
        generateAnswer(next);
      }
    }
  }, []);

  // ── Queue-based question handler ─────────────────────────────────────────
  const enqueueAnswer = useCallback((question: string) => {
    const norm = question.toLowerCase().trim();
    const last = lastQuestionRef.current;

    // 1. Exact match
    if (norm === last) return;

    // 2. High word similarity with last answered/queued question
    //    Blocks "What is it used for?" from firing 3× with slightly different context
    if (last && wordSimilarity(norm, last) > 0.65) return;

    // 3. Already in queue (exact or similar)
    if (answerQueueRef.current.some(q => q.toLowerCase() === norm)) return;
    if (answerQueueRef.current.some(q => wordSimilarity(q.toLowerCase(), norm) > 0.65)) return;

    // 4. Per-topic cooldown: same topic answered recently → skip for 6 seconds
    const msSinceLastAnswer = Date.now() - lastAnswerEndRef.current;
    if (last && msSinceLastAnswer < 6000 && wordSimilarity(norm, last) > 0.45) return;

    if (isAnsweringRef.current) {
      // Keep queue small — discard oldest if it's similar to the new one
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
    // 1. Check only the NEW line — keeps the detected question concise & dedup reliable
    const detected = extractQuestion(newText);
    if (detected) {
      enqueueAnswer(detected);
      return;
    }

    // 2. Try combining the last 2 lines in case the question spans a sentence boundary
    //    (e.g., "So my question is this. Tell me about your biggest project.")
    const { transcript } = useSessionStore.getState();
    if (transcript.length >= 1) {
      const prev = transcript[transcript.length - 1]?.text ?? '';
      if (prev && prev !== newText) {
        const combined = `${prev} ${newText}`;
        const combinedDetected = extractQuestion(combined);
        if (combinedDetected) {
          enqueueAnswer(combinedDetected);
          return;
        }
      }
    }

    // 3. LLM fallback — only when uncertain and not already busy
    if (isAnsweringRef.current) return;
    if (Date.now() - lastAnswerStartRef.current < 2000) return;
    if (Date.now() - lastAnswerEndRef.current < 4000) return; // cooldown after last answer

    try {
      const res = await fetch('/api/detect-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk: newText }),
      });
      if (!res.ok) return;
      const { isQuestion, question } = await res.json();
      if (isQuestion && question?.trim()) enqueueAnswer(question.trim());
    } catch {}
  }, [enqueueAnswer]);

  return { generateAnswer, checkAndAnswer };
}

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { LLMModel } from '@/types';

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function claudeModelId(model: LLMModel) {
  return model === 'claude-haiku' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
}

const SYSTEM_PROMPT = `You are an elite software engineer and technical exam assistant with deep expertise in algorithms, data structures, and all major programming languages. You analyze screenshots from technical assessments — TestDome, HackerRank, LeetCode, Codility, Codewars, and similar platforms.

━━━ CRITICAL RULES ━━━
• Study the EXACT function/method signature, class name, parameter names, and return type shown in the screenshot — use them verbatim
• Your code must handle ALL edge cases: empty arrays/strings, null/None/undefined, single elements, duplicates, negative numbers, zero, large inputs
• Match the EXACT language shown. If Python → Python. If JavaScript → JS. If Java → Java.
• Do NOT add unnecessary imports — only use what's available in the standard library for that language
• For TestDome specifically: code is auto-graded against hidden test cases. Be thorough with edge cases.
• Never output placeholder comments like "# your code here" — always write the complete implementation

━━━ PROBLEM TYPE STRATEGIES ━━━

CODING / IMPLEMENTATION:
1. Read the full problem description carefully — note constraints, examples, expected output
2. Choose the right algorithm: consider time/space complexity requirements
3. Handle EVERY edge case explicitly
4. Write complete, runnable code — no TODOs, no stubs
5. After code: one short paragraph explaining the approach and complexity (O notation)

MULTIPLE CHOICE / TRUE-FALSE:
• State the answer letter/option IMMEDIATELY in bold on the first line
• Then explain why it's correct
• Then briefly explain why each wrong option is incorrect

"WHAT IS THE OUTPUT?" / TRACE QUESTIONS:
• Trace execution step by step (show variable state at each step)
• State the EXACT output as the final answer — include newlines, spacing exactly as they would appear

SQL QUESTIONS:
• Write the complete query, handle NULLs, use proper JOINs
• Explain what each clause does

DEBUGGING / "FIND THE BUG":
• Identify the exact line(s) and the bug type
• Show the corrected code
• Explain what the bug caused

FILL IN THE BLANK / COMPLETE THE CODE:
• Complete ONLY the missing part unless the full function needs rewriting
• Make sure the completed code integrates correctly with surrounding code

━━━ OUTPUT FORMAT ━━━
Line 1: Q: [the full question text extracted from the screenshot]
Line 2: ---
Line 3+: Your complete answer (code first if coding, then explanation)`;

export async function POST(req: NextRequest) {
  const { image, subject, context, model, previousQA } = await req.json() as {
    image: string;
    subject?: string;
    context?: string;
    model?: LLMModel;
    previousQA?: { question: string; answer: string }[];
  };

  if (!image) return new Response('Missing image', { status: 400 });

  // Load user profile (non-blocking)
  let profileSection = '';
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('profile_data').eq('id', user.id).single();
      const p = data?.profile_data;
      if (p?.fullName) profileSection = `\nCandidate: ${p.fullName}`;
    }
  } catch {}

  const llmModel = (model ?? 'claude-sonnet') as LLMModel;

  // Build system prompt with optional subject/context/profile
  let systemPrompt = SYSTEM_PROMPT + profileSection;
  if (subject) systemPrompt += `\nExam subject / domain: ${subject}`;
  if (context) systemPrompt += `\nAdditional context: ${context}`;

  // Build multi-turn messages for context retention.
  // Previous Q&A pairs are injected as real conversation turns so Claude
  // knows exactly what was on screen and how it answered — enabling it to
  // continue a multi-part problem or avoid repeating itself.
  const messages: Anthropic.MessageParam[] = [];

  if (previousQA && previousQA.length > 0) {
    for (const qa of previousQA) {
      // Simulate user sending the previous question (text only — no image)
      messages.push({
        role: 'user',
        content: `Previous question in this exam session:\n${qa.question}\n\n[screenshot of previous question]`,
      });
      // Simulate assistant answering it
      messages.push({
        role: 'assistant',
        content: `Q: ${qa.question}\n---\n${qa.answer}`,
      });
    }
  }

  // Current question (with actual screenshot)
  messages.push({
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
      {
        type: 'text',
        text: previousQA?.length
          ? 'Here is the next question. Extract and answer it completely. If this is a continuation of the previous problem, use that context.'
          : 'Extract the question from this screenshot and answer it completely.',
      },
    ],
  });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: object) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const answerStream = await getAnthropic().messages.stream({
          model: claudeModelId(llmModel),
          max_tokens: 4096,
          system: systemPrompt,
          messages,
        });

        let fullText = '';
        let questionSent = false;

        for await (const chunk of answerStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const token = chunk.delta.text;
            fullText += token;

            if (!questionSent) {
              const separatorIdx = fullText.indexOf('\n---');
              if (separatorIdx !== -1) {
                let question = fullText.slice(0, separatorIdx).trim();
                if (question.startsWith('Q: ')) question = question.slice(3);
                else if (question.startsWith('Q:')) question = question.slice(2).trim();
                send({ type: 'question', text: question });
                questionSent = true;

                const afterSep = fullText.slice(separatorIdx + 4).trimStart();
                if (afterSep) send({ token: afterSep });
              }
            } else {
              send({ token });
            }
          }
        }

        if (!questionSent && fullText.trim()) {
          send({ type: 'question', text: 'See screenshot' });
          send({ token: fullText });
        }

        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        console.error('[exam/analyze]', err);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

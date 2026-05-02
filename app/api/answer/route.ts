import { NextRequest } from 'next/server';
import { streamAnswer, buildSystemPrompt } from '@/lib/llm';
import { LLMModel } from '@/types';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const { question, model, resumeText, jobTitle, companyName, jobDescription, extraContext, interviewType, history } =
    await req.json();

  // Load profile data — this is what makes answers sound like Jordan
  let profileData: Record<string, string> = {};
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('profile_data').eq('id', user.id).single();
      profileData = data?.profile_data ?? {};
    }
  } catch {}

  const systemPrompt = buildSystemPrompt({
    profileData,
    resumeText: resumeText ?? '',
    jobTitle: jobTitle ?? '',
    companyName: companyName ?? '',
    jobDescription: jobDescription ?? '',
    extraContext: extraContext ?? '',
    interviewType: interviewType ?? 'mixed',
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();
        for await (const token of streamAnswer(question, model as LLMModel, systemPrompt, history ?? [])) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        console.error('[answer]', err);
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

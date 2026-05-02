import { NextRequest } from 'next/server';
import { analyzeScreenshot } from '@/lib/llm';
import { LLMModel } from '@/types';

export async function POST(req: NextRequest) {
  const { image, model } = await req.json();

  if (!image) {
    return new Response('Missing image', { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const encoder = new TextEncoder();
        for await (const token of analyzeScreenshot(image, (model ?? 'claude-sonnet') as LLMModel)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        console.error('[analyze-screen]', err);
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

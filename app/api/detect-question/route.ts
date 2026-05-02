import { NextRequest, NextResponse } from 'next/server';
import { detectQuestion } from '@/lib/llm';

export async function POST(req: NextRequest) {
  try {
    const { chunk } = await req.json();

    if (!chunk) {
      return NextResponse.json({ isQuestion: false, question: '' });
    }

    const result = await detectQuestion(chunk);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[detect-question]', err);
    return NextResponse.json({ isQuestion: false, question: '' });
  }
}

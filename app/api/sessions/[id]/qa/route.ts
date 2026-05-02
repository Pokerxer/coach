import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { question, answer } = await req.json();

    const { data, error } = await supabase
      .from('session_qa_pairs')
      .insert({ session_id: sessionId, question, answer })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ qaPair: data });
  } catch (err) {
    console.error('[session qa POST]', err);
    return NextResponse.json({ error: 'Failed to save Q&A' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('session_qa_pairs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ qaPairs: data ?? [] });
  } catch (err) {
    console.error('[session qa GET]', err);
    return NextResponse.json({ error: 'Failed to fetch Q&A' }, { status: 500 });
  }
}

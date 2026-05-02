import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, resumes(file_name, parsed_text)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (sessionError) throw sessionError;

    // Get Q&A pairs
    const { data: qaPairs, error: qaError } = await supabase
      .from('session_qa_pairs')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (qaError) throw qaError;

    return NextResponse.json({ session, qaPairs });
  } catch (err) {
    console.error('[session GET]', err);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}
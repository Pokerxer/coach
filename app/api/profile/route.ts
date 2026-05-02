import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabase
      .from('profiles')
      .select('profile_data')
      .eq('id', user.id)
      .single();

    return NextResponse.json({ profileData: data?.profile_data ?? {} });
  } catch (err) {
    console.error('[profile GET]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { profileData } = await req.json();

    const { error } = await supabase
      .from('profiles')
      .update({ profile_data: profileData })
      .eq('id', user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[profile PUT]', err);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}

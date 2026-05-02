import { createBrowserClient } from '@supabase/ssr';

// Support both old (ANON_KEY) and new (PUBLISHABLE_KEY) Supabase env var names
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    SUPABASE_KEY
  );
}

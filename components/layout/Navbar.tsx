'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function Navbar() {
  const router = useRouter();

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push('/signin');
  };

  return (
    <header className="border-b border-white/10 bg-[#0A0A0F]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl">🦜</span>
          <span className="font-bold text-white text-lg tracking-tight">CoachAI</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link href="/dashboard" className="text-white/60 hover:text-white text-sm transition-colors">
            Dashboard
          </Link>
          <Link href="/settings" className="text-white/60 hover:text-white text-sm transition-colors">
            Settings
          </Link>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}

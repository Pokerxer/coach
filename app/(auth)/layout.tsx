export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | CoachAI',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
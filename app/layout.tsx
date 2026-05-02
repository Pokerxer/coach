import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CoachAI — Real-Time Interview Assistant',
  description: 'AI-powered answers during live interviews, in real time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-[#0A0A0F] text-white antialiased">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1a1a2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
          }}
        />
      </body>
    </html>
  );
}

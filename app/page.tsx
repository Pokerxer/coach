import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Mic, Brain, Shield, Check } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Nav */}
      <header className="border-b border-white/5 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🦜</span>
            <span className="font-bold text-white text-lg tracking-tight">CoachAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/signin" className="text-white/60 hover:text-white text-sm">Sign in</Link>
            <Link href="/signup">
              <Button size="sm">Get Started Free</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <Badge variant="default" className="mb-6 inline-flex">
          <Zap className="h-3 w-3 mr-1" />
          Real-time AI Interview Assistant
        </Badge>
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
          Ace every interview<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
            with AI in your ear
          </span>
        </h1>
        <p className="text-lg text-white/60 max-w-2xl mx-auto mb-10">
          CoachAI listens to your interview in real time, detects questions automatically,
          and streams perfect answers — personalized to your resume and the job.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/signup">
            <Button size="lg" className="w-full sm:w-auto">Start Free Trial</Button>
          </Link>
          <Link href="/signin">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">Sign In</Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Mic,
              title: 'Real-Time Transcription',
              desc: 'Your interview audio is transcribed live using Whisper. Every word captured, every question detected.',
            },
            {
              icon: Brain,
              title: 'AI-Powered Answers',
              desc: 'Claude & GPT-4o generate tailored answers using your resume and the job description. STAR method, technical depth.',
            },
            {
              icon: Shield,
              title: 'Discreet by Design',
              desc: 'Works in a separate window. "Safe Mode" looks like a notes app. Desktop app is invisible to screen share.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-all">
              <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-cyan-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Simple pricing</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              name: 'Starter',
              price: '$9.99',
              credits: '5 credits',
              features: ['~2.5 hours of interviews', 'Claude Sonnet + GPT-4o', 'Resume parsing', 'Post-session summary'],
              popular: false,
            },
            {
              name: 'Pro',
              price: '$24.99',
              credits: '15 credits',
              features: ['~7.5 hours of interviews', 'All models', 'Coding mode', 'Priority support'],
              popular: true,
            },
            {
              name: 'Unlimited',
              price: '$29.99/mo',
              credits: 'Unlimited',
              features: ['Unlimited sessions', 'All features', 'Meeting detection', 'Lifetime option available'],
              popular: false,
            },
          ].map(({ name, price, credits, features, popular }) => (
            <div
              key={name}
              className={`p-6 rounded-xl border relative ${popular ? 'border-cyan-500 bg-cyan-500/5' : 'border-white/10 bg-white/5'}`}
            >
              {popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              )}
              <h3 className="text-white font-bold text-xl mb-1">{name}</h3>
              <p className="text-3xl font-bold text-white mb-1">{price}</p>
              <p className="text-white/40 text-sm mb-6">{credits}</p>
              <ul className="space-y-2 mb-8">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/70">
                    <Check className="h-4 w-4 text-cyan-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button variant={popular ? 'default' : 'outline'} className="w-full">
                  Get Started
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 text-center text-white/30 text-sm">
        © {new Date().getFullYear()} CoachAI — Built with Claude
      </footer>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CREDIT_PACKS, SUBSCRIPTION_PLANS } from '@/lib/stripe';
import { Check, Loader2, Zap, Crown } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase';
import { Profile } from '@/types';

export default function BillingPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (!user) return;
      supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
        setProfile(data);
      });
    });
  }, []);

  const checkout = async (priceId: string, mode: 'payment' | 'subscription') => {
    setLoading(priceId);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, mode }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      toast.error('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-white">Credits & Billing</h1>
          <p className="text-white/50 mt-1">Purchase credits or upgrade your plan</p>
        </div>

        {/* Current plan */}
        {profile && (
          <div className="mb-10 p-5 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm text-white/50">Current plan</p>
              <p className="text-xl font-bold text-white capitalize mt-1">{profile.subscription_plan}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/50">Credits remaining</p>
              <p className="text-2xl font-bold text-cyan-400 mt-1">
                {profile.subscription_plan !== 'free' ? '∞' : profile.credits.toFixed(1)}
              </p>
            </div>
          </div>
        )}

        {/* Credit Packs */}
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-400" />
          Credit Packs (one-time)
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-12">
          {CREDIT_PACKS.map((pack) => (
            <div key={pack.id} className={`p-5 rounded-xl border ${pack.popular ? 'border-cyan-500 bg-cyan-500/5' : 'border-white/10 bg-white/5'} relative`}>
              {pack.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              )}
              <h3 className="font-bold text-white text-lg mb-1">{pack.name}</h3>
              <p className="text-2xl font-bold text-white mb-1">{formatPrice(pack.price)}</p>
              <p className="text-white/40 text-sm mb-4">{pack.description}</p>
              <Button
                className="w-full"
                variant={pack.popular ? 'default' : 'outline'}
                disabled={loading === pack.priceId}
                onClick={() => checkout(pack.priceId, 'payment')}
              >
                {loading === pack.priceId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buy Now'}
              </Button>
            </div>
          ))}
        </div>

        {/* Subscriptions */}
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Crown className="h-4 w-4 text-yellow-400" />
          Unlimited Plans
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <div key={plan.id} className="p-5 rounded-xl border border-white/10 bg-white/5">
              <h3 className="font-bold text-white text-lg mb-1">{plan.name}</h3>
              <p className="text-2xl font-bold text-white mb-1">{formatPrice(plan.price)}</p>
              <p className="text-white/40 text-sm mb-1">{plan.interval === 'one-time' ? 'One-time payment' : `Per ${plan.interval}`}</p>
              <p className="text-white/60 text-sm mb-4">{plan.description}</p>
              <ul className="space-y-1 mb-5">
                {['Unlimited sessions', 'All AI models', 'Priority support', 'All features'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/70">
                    <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                disabled={loading === plan.priceId}
                onClick={() => checkout(plan.priceId, plan.interval === 'one-time' ? 'payment' : 'subscription')}
              >
                {loading === plan.priceId ? <Loader2 className="h-4 w-4 animate-spin" /> : `Get ${plan.name}`}
              </Button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

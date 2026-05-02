import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase-server';
import Stripe from 'stripe';

const CREDIT_AMOUNTS: Record<string, number> = {
  [process.env.STRIPE_PRICE_ID_5_CREDITS!]: 5,
  [process.env.STRIPE_PRICE_ID_15_CREDITS!]: 15,
  [process.env.STRIPE_PRICE_ID_30_CREDITS!]: 30,
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[stripe webhook] signature error', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (!userId) return NextResponse.json({ ok: true });

    // Credit pack purchase
    if (session.mode === 'payment' && session.line_items) {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      for (const item of lineItems.data) {
        const priceId = item.price?.id;
        if (priceId && CREDIT_AMOUNTS[priceId]) {
          const credits = CREDIT_AMOUNTS[priceId];
          await supabase.rpc('add_credits', {
            user_id: userId,
            amount: credits,
            stripe_payment_intent_id: session.payment_intent as string,
          });
        }
      }
    }

    // Subscription
    if (session.mode === 'subscription') {
      const priceId = session.metadata?.priceId;
      const plan = priceId === process.env.STRIPE_PRICE_ID_LIFETIME ? 'lifetime' : 'monthly';
      const expiresAt =
        plan === 'monthly' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

      await supabase
        .from('profiles')
        .update({ subscription_plan: plan, subscription_expires_at: expiresAt })
        .eq('id', userId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.userId;
    if (userId) {
      await supabase
        .from('profiles')
        .update({ subscription_plan: 'free', subscription_expires_at: null })
        .eq('id', userId);
    }
  }

  return NextResponse.json({ ok: true });
}

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia',
    });
  }
  return _stripe;
}

export const stripe = {
  get webhooks() {
    return getStripe().webhooks;
  },
  get subscriptions() {
    return getStripe().subscriptions;
  },
  get checkout() {
    return getStripe().checkout;
  },
  get accounts() {
    return getStripe().accounts;
  },
};

export const CREDIT_PACKS = [
  {
    id: '5_credits',
    name: '5 Credits',
    credits: 5,
    price: 999,
    priceId: process.env.STRIPE_PRICE_ID_5_CREDITS!,
    description: '~2.5 hours of interviews',
  },
  {
    id: '15_credits',
    name: '15 Credits',
    credits: 15,
    price: 2499,
    priceId: process.env.STRIPE_PRICE_ID_15_CREDITS!,
    description: '~7.5 hours of interviews',
    popular: true,
  },
  {
    id: '30_credits',
    name: '30 Credits',
    credits: 30,
    price: 4499,
    priceId: process.env.STRIPE_PRICE_ID_30_CREDITS!,
    description: '~15 hours of interviews',
  },
];

export const SUBSCRIPTION_PLANS = [
  {
    id: 'monthly',
    name: 'Unlimited Monthly',
    price: 2999,
    priceId: process.env.STRIPE_PRICE_ID_MONTHLY!,
    description: 'Unlimited sessions per month',
    interval: 'month',
  },
  {
    id: 'lifetime',
    name: 'Lifetime Access',
    price: 9900,
    priceId: process.env.STRIPE_PRICE_ID_LIFETIME!,
    description: 'One-time payment, unlimited forever',
    interval: 'one-time',
  },
];

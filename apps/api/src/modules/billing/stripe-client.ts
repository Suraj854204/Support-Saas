import Stripe from "stripe";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";

let client: Stripe | null = null;

export function billingConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/** Lazily created so a server without Stripe keys still boots; billing calls then fail clearly. */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw AppError.billingNotConfigured();
  client ??= new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15_000 });
  return client;
}

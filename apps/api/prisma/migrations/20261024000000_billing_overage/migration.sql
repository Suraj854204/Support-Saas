-- Additive: one column. Overage is opt-in, so existing subscriptions keep today's behaviour.
ALTER TABLE "subscriptions" ADD COLUMN "overage_enabled" BOOLEAN NOT NULL DEFAULT false;

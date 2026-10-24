-- Additive only: two new columns with safe defaults.
ALTER TABLE "intake_forms" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'web';
ALTER TABLE "intake_forms" ADD COLUMN "google_form_url" TEXT;

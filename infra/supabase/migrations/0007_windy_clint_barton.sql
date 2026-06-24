ALTER TABLE "creators" ADD COLUMN IF NOT EXISTS "leniency" text DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "leniency" text;

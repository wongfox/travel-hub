CREATE TYPE "public"."notification_channel" AS ENUM('banner', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'skipped_policy');--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_ref" text NOT NULL,
	"alert_type" text NOT NULL,
	"source_event_id" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "notification_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_dedupe_key_unique" UNIQUE("dedupe_key")
);

CREATE TYPE "public"."staff_alert_status" AS ENUM('pending', 'sent', 'failed', 'dead');--> statement-breakpoint
CREATE TABLE "staff_alert" (
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "staff_alert_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pulse_response_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "staff_alert_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	CONSTRAINT "staff_alert_pulse_response_id_unique" UNIQUE("pulse_response_id"),
	CONSTRAINT "staff_alert_payload_minimal_keys" CHECK (("staff_alert"."payload" - ARRAY['alertId', 'reservationRef', 'passengerOrdinal', 'leg', 'returnLegDepartureLocal', 'serviceTier', 'score', 'scaleMax', 'answeredAt', 'passengerLocale']::text[]) = '{}'::jsonb)
);
--> statement-breakpoint
CREATE INDEX "staff_alert_purge_after_idx" ON "staff_alert" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "staff_alert_pending_idx" ON "staff_alert" USING btree ("seq") WHERE "staff_alert"."status" = 'pending';
CREATE TABLE "analytics_event" (
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "analytics_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_hash" text NOT NULL,
	"name" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"forwarded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "analytics_event_pending_idx" ON "analytics_event" USING btree ("seq") WHERE "analytics_event"."forwarded_at" is null;--> statement-breakpoint
CREATE INDEX "analytics_event_trip_hash_idx" ON "analytics_event" USING btree ("trip_hash");
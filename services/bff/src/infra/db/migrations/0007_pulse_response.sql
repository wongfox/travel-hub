CREATE TABLE "pulse_response" (
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "pulse_response_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_ref" text NOT NULL,
	"passenger_ref" text NOT NULL,
	"leg_ref" text NOT NULL,
	"score" integer NOT NULL,
	"locale" text NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	CONSTRAINT "pulse_response_passenger_leg_unique" UNIQUE("reservation_ref","passenger_ref","leg_ref")
);
--> statement-breakpoint
CREATE INDEX "pulse_response_purge_after_idx" ON "pulse_response" USING btree ("purge_after");
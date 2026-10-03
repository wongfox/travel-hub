CREATE TABLE "push_subscription" (
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "push_subscription_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"reservation_ref" text NOT NULL,
	"passenger_scope" text[] DEFAULT '{}' NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"locale" text NOT NULL,
	"consent_record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_subscription_reservation_idx" ON "push_subscription" USING btree ("reservation_ref");--> statement-breakpoint
CREATE INDEX "push_subscription_link_idx" ON "push_subscription" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "push_subscription_expires_at_idx" ON "push_subscription" USING btree ("expires_at");
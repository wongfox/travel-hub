CREATE TYPE "public"."wifi_order_status" AS ENUM('CREATED', 'PAYMENT_PENDING', 'PAID', 'ENTITLEMENT_ACTIVE', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED');--> statement-breakpoint
CREATE TABLE "wifi_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_ref" text NOT NULL,
	"passenger_ref" text NOT NULL,
	"package_id" text NOT NULL,
	"leg_ref" text DEFAULT '' NOT NULL,
	"buyer_email" text DEFAULT '' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "wifi_order_status" DEFAULT 'CREATED' NOT NULL,
	"idempotency_key" text NOT NULL,
	"gateway_session_ref" text,
	"gateway_payment_ref" text,
	"entitlement_ref" text,
	"entitlement_expires_at" timestamp with time zone,
	"sir_registered_at" timestamp with time zone,
	"sir_sale_ref" text,
	"sir_registration_attempts" integer DEFAULT 0 NOT NULL,
	"sir_reconciliation_required" boolean DEFAULT false NOT NULL,
	"receipt_issued_at" timestamp with time zone,
	"receipt_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wifi_order_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "wifi_order_event" (
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "wifi_order_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "wifi_order_status" NOT NULL,
	"to_status" "wifi_order_status" NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wifi_order_event" ADD CONSTRAINT "wifi_order_event_order_id_wifi_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wifi_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wifi_order_status_idx" ON "wifi_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wifi_order_event_order_id_idx" ON "wifi_order_event" USING btree ("order_id","seq");
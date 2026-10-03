CREATE TYPE "public"."consent_purpose" AS ENUM('analytics', 'push', 'pulse', 'precheckin_biometric');--> statement-breakpoint
CREATE TABLE "access_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"reservation_ref" text NOT NULL,
	"passenger_scope" text[] DEFAULT '{}' NOT NULL,
	"locale_hint" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"superseded_by" uuid,
	"issue_channel" text NOT NULL,
	CONSTRAINT "access_link_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"reservation_ref" text NOT NULL,
	"passenger_ref" text,
	"purpose" "consent_purpose" NOT NULL,
	"text_version" text NOT NULL,
	"granted" boolean NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag" (
	"key" text PRIMARY KEY NOT NULL,
	"value" boolean NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pii_access_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"link_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"locale" text NOT NULL,
	"user_agent_class" text
);
--> statement-breakpoint
ALTER TABLE "access_link" ADD CONSTRAINT "access_link_superseded_by_access_link_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."access_link"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_link_id_access_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."access_link"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_link_id_access_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."access_link"("id") ON DELETE no action ON UPDATE no action;
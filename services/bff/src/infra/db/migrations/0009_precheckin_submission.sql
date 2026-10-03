CREATE TYPE "public"."precheckin_doc_type" AS ENUM('DNI', 'PASSPORT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."precheckin_submission_status" AS ENUM('received', 'handed_off', 'purged');--> statement-breakpoint
CREATE TABLE "precheckin_submission" (
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "precheckin_submission_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_ref" text NOT NULL,
	"passenger_ref" text NOT NULL,
	"doc_type" "precheckin_doc_type" NOT NULL,
	"consent_record_id" text NOT NULL,
	"status" "precheckin_submission_status" DEFAULT 'received' NOT NULL,
	"photo_object_key" text NOT NULL,
	"photo_wrapped_data_key" "bytea" NOT NULL,
	"photo_iv" "bytea" NOT NULL,
	"photo_auth_tag" "bytea" NOT NULL,
	"id_front_object_key" text NOT NULL,
	"id_front_wrapped_data_key" "bytea" NOT NULL,
	"id_front_iv" "bytea" NOT NULL,
	"id_front_auth_tag" "bytea" NOT NULL,
	"id_back_object_key" text,
	"id_back_wrapped_data_key" "bytea",
	"id_back_iv" "bytea",
	"id_back_auth_tag" "bytea",
	"submitted_at" timestamp with time zone NOT NULL,
	"handed_off_at" timestamp with time zone,
	"purge_after" timestamp with time zone NOT NULL,
	"purged_at" timestamp with time zone,
	CONSTRAINT "precheckin_submission_passenger_unique" UNIQUE("reservation_ref","passenger_ref"),
	CONSTRAINT "precheckin_submission_id_back_all_or_none" CHECK (("precheckin_submission"."id_back_object_key" IS NULL) = ("precheckin_submission"."id_back_wrapped_data_key" IS NULL) AND ("precheckin_submission"."id_back_object_key" IS NULL) = ("precheckin_submission"."id_back_iv" IS NULL) AND ("precheckin_submission"."id_back_object_key" IS NULL) = ("precheckin_submission"."id_back_auth_tag" IS NULL)),
	CONSTRAINT "precheckin_submission_purged_shredded" CHECK ("precheckin_submission"."status" <> 'purged' OR (octet_length("precheckin_submission"."photo_wrapped_data_key") = 0 AND octet_length("precheckin_submission"."photo_iv") = 0 AND octet_length("precheckin_submission"."photo_auth_tag") = 0 AND octet_length("precheckin_submission"."id_front_wrapped_data_key") = 0 AND octet_length("precheckin_submission"."id_front_iv") = 0 AND octet_length("precheckin_submission"."id_front_auth_tag") = 0 AND coalesce(octet_length("precheckin_submission"."id_back_wrapped_data_key"), 0) = 0 AND coalesce(octet_length("precheckin_submission"."id_back_iv"), 0) = 0 AND coalesce(octet_length("precheckin_submission"."id_back_auth_tag"), 0) = 0))
);
--> statement-breakpoint
CREATE INDEX "precheckin_submission_purge_after_idx" ON "precheckin_submission" USING btree ("purge_after") WHERE "precheckin_submission"."status" <> 'purged';--> statement-breakpoint
CREATE INDEX "precheckin_submission_pending_handoff_idx" ON "precheckin_submission" USING btree ("seq") WHERE "precheckin_submission"."status" = 'received';
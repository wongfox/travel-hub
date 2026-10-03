ALTER TABLE "consent_record" DROP CONSTRAINT "consent_record_link_id_access_link_id_fk";
--> statement-breakpoint
ALTER TABLE "consent_record" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "consent_record_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
CREATE INDEX "consent_record_latest_idx" ON "consent_record" USING btree ("reservation_ref","purpose","seq");
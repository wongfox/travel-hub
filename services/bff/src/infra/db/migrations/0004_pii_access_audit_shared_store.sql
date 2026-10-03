ALTER TABLE "pii_access_audit" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "pii_access_audit_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
CREATE INDEX "pii_access_audit_subject_idx" ON "pii_access_audit" USING btree ("subject_type","subject_id","seq");--> statement-breakpoint
CREATE FUNCTION "pii_access_audit_reject_change"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'pii_access_audit is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER pii_access_audit_append_only
	BEFORE UPDATE OR DELETE ON "pii_access_audit"
	FOR EACH ROW EXECUTE FUNCTION "pii_access_audit_reject_change"();

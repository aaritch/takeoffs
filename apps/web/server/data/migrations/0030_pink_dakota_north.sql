CREATE TABLE "retainer_ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"retainer_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"balance_after_minor" bigint NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retainer_ledger_entries" ADD CONSTRAINT "retainer_ledger_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retainer_ledger_entries" ADD CONSTRAINT "retainer_ledger_entries_retainer_id_retainers_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retainer_ledger_org_idx" ON "retainer_ledger_entries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "retainer_ledger_retainer_idx" ON "retainer_ledger_entries" USING btree ("retainer_id");
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"takeoff_id" uuid NOT NULL,
	"template" text NOT NULL,
	"format" text DEFAULT 'CSV' NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"storage_key" text,
	"file_name" text,
	"file_size_bytes" bigint,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_takeoff_id_takeoffs_id_fk" FOREIGN KEY ("takeoff_id") REFERENCES "public"."takeoffs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_org_idx" ON "reports" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "reports_takeoff_idx" ON "reports" USING btree ("takeoff_id");
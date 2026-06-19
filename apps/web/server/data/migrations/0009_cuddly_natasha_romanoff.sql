CREATE TABLE "plan_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"label" text,
	"source_file_count" integer DEFAULT 0 NOT NULL,
	"total_sheet_count" integer DEFAULT 0 NOT NULL,
	"processing_status" text DEFAULT 'UPLOADING' NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_set_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"page_count" integer,
	"upload_status" text DEFAULT 'AWAITING_UPLOAD' NOT NULL,
	"ingest_status" text DEFAULT 'PENDING' NOT NULL,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "plan_sets" ADD CONSTRAINT "plan_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_sets" ADD CONSTRAINT "plan_sets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_plan_set_id_plan_sets_id_fk" FOREIGN KEY ("plan_set_id") REFERENCES "public"."plan_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_sets_org_idx" ON "plan_sets" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_sets_project_version_idx" ON "plan_sets" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "source_files_org_idx" ON "source_files" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "source_files_plan_set_idx" ON "source_files" USING btree ("plan_set_id");--> statement-breakpoint
-- Org isolation (P0-07): every customer-owned table with org_id must enable fail-closed RLS.
SELECT enable_org_rls('plan_sets');--> statement-breakpoint
SELECT enable_org_rls('source_files');
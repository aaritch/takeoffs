CREATE TABLE "sheets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_set_id" uuid NOT NULL,
	"source_file_id" uuid NOT NULL,
	"index_in_set" integer NOT NULL,
	"sheet_number" text,
	"sheet_title" text,
	"discipline" text DEFAULT 'UNKNOWN' NOT NULL,
	"width_px" integer,
	"height_px" integer,
	"dpi" integer,
	"tile_pyramid_key" text,
	"thumbnail_key" text,
	"scale_status" text DEFAULT 'UNSET' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_plan_set_id_plan_sets_id_fk" FOREIGN KEY ("plan_set_id") REFERENCES "public"."plan_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_source_file_id_source_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sheets_org_idx" ON "sheets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sheets_plan_set_idx" ON "sheets" USING btree ("plan_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sheets_source_file_index_idx" ON "sheets" USING btree ("source_file_id","index_in_set");--> statement-breakpoint
-- Org isolation (P0-07): sheets is customer-owned, so enable fail-closed RLS.
SELECT enable_org_rls('sheets');
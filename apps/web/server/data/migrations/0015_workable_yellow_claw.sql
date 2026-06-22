CREATE TABLE "model_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_set_id" uuid NOT NULL,
	"sheet_id" uuid,
	"pipeline_version" text NOT NULL,
	"model_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"error_detail" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_plan_set_id_plan_sets_id_fk" FOREIGN KEY ("plan_set_id") REFERENCES "public"."plan_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_runs_org_idx" ON "model_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "model_runs_plan_set_idx" ON "model_runs" USING btree ("plan_set_id");
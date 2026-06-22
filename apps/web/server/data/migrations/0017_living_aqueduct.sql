CREATE TABLE "detection_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"measurement_id" uuid NOT NULL,
	"model_run_id" uuid,
	"action" text NOT NULL,
	"before_geometry" jsonb,
	"after_geometry" jsonb,
	"from_class" text,
	"to_class" text,
	"actor_user_id" uuid,
	"actor_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "detection_feedback" ADD CONSTRAINT "detection_feedback_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detection_feedback" ADD CONSTRAINT "detection_feedback_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detection_feedback_org_idx" ON "detection_feedback" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "detection_feedback_measurement_idx" ON "detection_feedback" USING btree ("measurement_id");--> statement-breakpoint
CREATE INDEX "detection_feedback_model_run_idx" ON "detection_feedback" USING btree ("model_run_id");
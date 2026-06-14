CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"sheet_id" uuid,
	"geom_type" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"raw_value" double precision NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"ai_confidence" double precision,
	"review_status" text DEFAULT 'UNREVIEWED' NOT NULL,
	"created_by_user_id" uuid,
	"model_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quantity_rollups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"base_quantity" double precision DEFAULT 0 NOT NULL,
	"quantity_with_waste" double precision DEFAULT 0 NOT NULL,
	"derived_volume" double precision,
	"derived_surface_area" double precision,
	"extended_cost_minor" bigint,
	"measurement_count" integer DEFAULT 0 NOT NULL,
	"last_computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quantity_rollups" ADD CONSTRAINT "quantity_rollups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quantity_rollups" ADD CONSTRAINT "quantity_rollups_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "measurements_org_idx" ON "measurements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "measurements_condition_idx" ON "measurements" USING btree ("condition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quantity_rollups_condition_unique" ON "quantity_rollups" USING btree ("condition_id");
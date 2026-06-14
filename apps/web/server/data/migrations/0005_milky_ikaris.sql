CREATE TABLE "takeoffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"plan_set_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"origin" text DEFAULT 'SELF_SERVE' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conditions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"takeoff_id" uuid NOT NULL,
	"trade_category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"measurement_type" text NOT NULL,
	"unit" text NOT NULL,
	"color_hex" text,
	"depth_or_height" double precision,
	"waste_factor_pct" double precision DEFAULT 0 NOT NULL,
	"unit_cost_minor" bigint,
	"notes" text,
	"ai_object_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "takeoffs" ADD CONSTRAINT "takeoffs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeoffs" ADD CONSTRAINT "takeoffs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_takeoff_id_takeoffs_id_fk" FOREIGN KEY ("takeoff_id") REFERENCES "public"."takeoffs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_trade_category_id_trade_categories_id_fk" FOREIGN KEY ("trade_category_id") REFERENCES "public"."trade_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "takeoffs_org_idx" ON "takeoffs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "takeoffs_project_idx" ON "takeoffs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "conditions_org_idx" ON "conditions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "conditions_takeoff_idx" ON "conditions" USING btree ("takeoff_id");
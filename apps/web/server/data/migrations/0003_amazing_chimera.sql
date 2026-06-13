CREATE TABLE "trade_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"division_code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "condition_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"trade_category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"measurement_type" text NOT NULL,
	"unit" text NOT NULL,
	"color_hex" text,
	"default_waste_factor_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"ai_object_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trade_categories" ADD CONSTRAINT "trade_categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_templates" ADD CONSTRAINT "condition_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_templates" ADD CONSTRAINT "condition_templates_trade_category_id_trade_categories_id_fk" FOREIGN KEY ("trade_category_id") REFERENCES "public"."trade_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_categories_global_division_unique" ON "trade_categories" USING btree ("division_code") WHERE "trade_categories"."org_id" is null;--> statement-breakpoint
CREATE INDEX "trade_categories_org_idx" ON "trade_categories" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "condition_templates_global_unique" ON "condition_templates" USING btree ("trade_category_id","name") WHERE "condition_templates"."org_id" is null;--> statement-breakpoint
CREATE INDEX "condition_templates_org_idx" ON "condition_templates" USING btree ("org_id");
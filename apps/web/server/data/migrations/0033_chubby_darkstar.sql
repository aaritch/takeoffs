CREATE TABLE "assemblies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"takeoff_id" uuid NOT NULL,
	"name" text NOT NULL,
	"driver_measurement_type" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assembly_components" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"assembly_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"factor" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assembly_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"assembly_id" uuid NOT NULL,
	"sheet_id" uuid,
	"geom_type" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"base_value" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_takeoff_id_takeoffs_id_fk" FOREIGN KEY ("takeoff_id") REFERENCES "public"."takeoffs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_assembly_id_assemblies_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."assemblies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_instances" ADD CONSTRAINT "assembly_instances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_instances" ADD CONSTRAINT "assembly_instances_assembly_id_assemblies_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."assemblies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assemblies_takeoff_idx" ON "assemblies" USING btree ("takeoff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assembly_components_unique" ON "assembly_components" USING btree ("assembly_id","condition_id") WHERE "assembly_components"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "assembly_components_condition_idx" ON "assembly_components" USING btree ("condition_id");--> statement-breakpoint
CREATE INDEX "assembly_instances_assembly_idx" ON "assembly_instances" USING btree ("assembly_id");
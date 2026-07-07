CREATE TABLE "model_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"model_family" text NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'CANDIDATE' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"benchmark_id" text,
	"previous_active_id" uuid,
	"activated_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "model_versions_family_version_unique" ON "model_versions" USING btree ("model_family","version");--> statement-breakpoint
CREATE UNIQUE INDEX "model_versions_one_active_per_family" ON "model_versions" USING btree ("model_family") WHERE "model_versions"."status" = 'ACTIVE' and "model_versions"."deleted_at" is null;
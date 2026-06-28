CREATE TABLE "sso_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"protocol" text NOT NULL,
	"email_domain" text NOT NULL,
	"issuer" text NOT NULL,
	"default_role" text NOT NULL,
	"require_mfa" boolean DEFAULT false NOT NULL,
	"domain_verified" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sso_connections_domain_unique" ON "sso_connections" USING btree ("email_domain") WHERE "sso_connections"."deleted_at" is null;
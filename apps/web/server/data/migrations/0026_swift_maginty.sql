CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"provider_customer_ref" text,
	"provider_subscription_ref" text NOT NULL,
	"status" text NOT NULL,
	"plan_tier" text NOT NULL,
	"seat_limit" integer NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"subscription_ref" text,
	"org_ref" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_ref_unique" ON "subscriptions" USING btree ("provider_subscription_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_org_unique" ON "subscriptions" USING btree ("org_id") WHERE "subscriptions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_provider_event_unique" ON "billing_events" USING btree ("provider_event_id");
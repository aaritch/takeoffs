CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_tier" text NOT NULL,
	"priority" text NOT NULL,
	"base_price_minor" bigint NOT NULL,
	"per_trade_price_minor" bigint DEFAULT 0 NOT NULL,
	"per_sheet_price_minor" bigint DEFAULT 0 NOT NULL,
	"base_turnaround_hours" integer NOT NULL,
	"per_trade_hours" integer DEFAULT 0 NOT NULL,
	"per_sheet_hours" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rules_tier_priority_unique" ON "pricing_rules" USING btree ("service_tier","priority");
CREATE TABLE "payout_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_profile_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_transfer_ref" text,
	"provider_reversal_ref" text,
	"reversal_reason" text,
	"settled_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payout_records" ADD CONSTRAINT "payout_records_service_profile_id_service_profiles_id_fk" FOREIGN KEY ("service_profile_id") REFERENCES "public"."service_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_records" ADD CONSTRAINT "payout_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_records_order_unique" ON "payout_records" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payout_records_profile_idx" ON "payout_records" USING btree ("service_profile_id");
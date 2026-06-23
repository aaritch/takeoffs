CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"plan_set_id" uuid,
	"requested_by_user_id" uuid,
	"service_tier" text NOT NULL,
	"requested_trades" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_notes" text,
	"priority" text DEFAULT 'STANDARD' NOT NULL,
	"promised_turnaround_hours" integer,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"price_quote_minor" bigint,
	"assigned_estimator_id" uuid,
	"qa_reviewer_id" uuid,
	"delivered_takeoff_id" uuid,
	"placed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_set_id_plan_sets_id_fk" FOREIGN KEY ("plan_set_id") REFERENCES "public"."plan_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_org_idx" ON "order_events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_org_idx" ON "orders" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "orders_project_idx" ON "orders" USING btree ("project_id");
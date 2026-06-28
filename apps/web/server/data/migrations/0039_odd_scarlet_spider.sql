CREATE TABLE "dr_drill_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"integrity_ok" boolean NOT NULL,
	"restored_row_count" integer NOT NULL,
	"data_loss_seconds" double precision NOT NULL,
	"recovery_seconds" double precision NOT NULL,
	"within_rpo" boolean NOT NULL,
	"within_rto" boolean NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

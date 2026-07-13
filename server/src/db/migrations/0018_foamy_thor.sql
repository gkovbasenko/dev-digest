ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "owner_kind" text NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "owner_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "traces_passed" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "traces_total" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "case_results" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;
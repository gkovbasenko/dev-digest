ALTER TABLE "ci_runs" ADD COLUMN "github_run_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_github_run_id_uq" ON "ci_runs" USING btree ("github_run_id");
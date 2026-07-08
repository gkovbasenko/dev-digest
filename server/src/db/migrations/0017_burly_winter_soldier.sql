ALTER TABLE "pr_brief" ADD COLUMN "generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "generation_head_sha" text;
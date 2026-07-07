CREATE TABLE "run_skills" (
	"run_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_skills_run_id_skill_id_pk" PRIMARY KEY("run_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "run_skills" ADD CONSTRAINT "run_skills_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_skills" ADD CONSTRAINT "run_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
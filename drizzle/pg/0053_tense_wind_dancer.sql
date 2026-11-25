CREATE TABLE "project_access_assignments" (
	"member_id" text NOT NULL,
	"project_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "project_access_assignments_member_id_project_id_pk" PRIMARY KEY("member_id","project_id"),
	CONSTRAINT "project_access_assignments_role_check" CHECK ("project_access_assignments"."role" in ('viewer', 'collaborator'))
);
--> statement-breakpoint
ALTER TABLE "project_access_assignments" ADD CONSTRAINT "project_access_assignments_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_access_assignments" ADD CONSTRAINT "project_access_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_access_assignments_project_idx" ON "project_access_assignments" USING btree ("project_id");
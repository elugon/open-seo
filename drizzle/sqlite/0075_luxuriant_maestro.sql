CREATE TABLE `project_access_assignments` (
	`member_id` text NOT NULL,
	`project_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`member_id`, `project_id`),
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_access_assignments_role_check" CHECK("project_access_assignments"."role" in ('viewer', 'collaborator'))
);
--> statement-breakpoint
CREATE INDEX `project_access_assignments_project_idx` ON `project_access_assignments` (`project_id`);
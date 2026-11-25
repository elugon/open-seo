import { requireOrgPermission } from "@/server/auth/org-gate";
import {
  isProjectRestricted,
  ProjectAccessService,
} from "@/server/features/projects/services/ProjectAccessService";
import { AppError } from "@/server/lib/errors";

export async function requireAuditRemovalPermission(
  actor: { userId: string; organizationId: string; role: string },
  projectId: string,
) {
  if (!isProjectRestricted(actor)) {
    // Deleting audits frees capacity on the hosted free plan.
    requireOrgPermission(actor, { project: ["delete"] });
    return;
  }

  const project = await ProjectAccessService.getProject(
    actor,
    projectId,
    "collaborate",
  );
  if (!project) throw new AppError("NOT_FOUND");
}

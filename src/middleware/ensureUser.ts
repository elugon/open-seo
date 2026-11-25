import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { AppError } from "@/server/lib/errors";
import { ProjectAccessService } from "@/server/features/projects/services/ProjectAccessService";

function extractProjectId(data: unknown) {
  if (!data || typeof data !== "object" || !("projectId" in data)) {
    return null;
  }

  const projectId = (data as { projectId?: unknown }).projectId;
  return typeof projectId === "string" && projectId.length > 0
    ? projectId
    : null;
}

export const ensureUserMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next, data }) => {
  const context = await resolveUserContextFromHeaders(getRequest().headers);

  const projectId = extractProjectId(data);

  let project: EnsuredUserContext["project"];
  let projectAccessRole: EnsuredUserContext["projectAccessRole"];

  if (projectId) {
    // Resolve the live assignment once per request. Function-level middleware
    // checks what a handler is allowed to do with the project.
    const authorized = await ProjectAccessService.getProject(
      context,
      projectId,
      "read",
    );
    if (!authorized) {
      throw new AppError("NOT_FOUND");
    }
    const { accessRole, ...projectData } = authorized;
    project = projectData;
    projectAccessRole = accessRole;
  }

  return next({
    context: {
      ...context,
      project,
      projectAccessRole,
    },
  });
});

import { createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { errorHandlingMiddleware } from "@/middleware/errorHandling";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { ensureUserMiddleware } from "@/middleware/ensureUser";
import { isProjectRestricted } from "@/server/features/projects/services/ProjectAccessService";

const ensuredUserContextSchema: z.ZodType<EnsuredUserContext> = z.object({
  userId: z.string(),
  userEmail: z.string(),
  emailVerified: z.boolean(),
  organizationId: z.string(),
  role: z.string(),
  project: z.any().optional(),
  projectAccessRole: z.enum(["viewer", "collaborator", "admin"]).optional(),
});

function getAuthenticatedContext(context: unknown): EnsuredUserContext {
  const result = ensuredUserContextSchema.safeParse(context);
  if (!result.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Authenticated server function context missing",
    );
  }
  return result.data;
}

export const globalServerFunctionMiddleware = [
  errorHandlingMiddleware,
  ensureUserMiddleware,
] as const;

export const requirePersonalContext = [
  createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const authenticatedContext = getAuthenticatedContext(context);

    return next({
      context: authenticatedContext,
    });
  }),
] as const;

// Organization-wide functions must opt in to a narrower context before they
// can be called by a project-scoped Cloudflare Access user.
export const requireAuthenticatedContext = [
  createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const authenticatedContext = getAuthenticatedContext(context);
    if (isProjectRestricted(authenticatedContext)) {
      throw new AppError("FORBIDDEN");
    }
    return next({ context: authenticatedContext });
  }),
] as const;

function requireProject(permission: "read" | "collaborate") {
  return createMiddleware({ type: "function" }).server(
    async ({ next, context }) => {
      const authenticatedContext = getAuthenticatedContext(context);
      if (isProjectRestricted(authenticatedContext)) {
        const { projectAccessRole } = authenticatedContext;
        if (!authenticatedContext.project || !projectAccessRole) {
          throw new AppError("NOT_FOUND");
        }
        if (
          permission === "collaborate" &&
          projectAccessRole !== "collaborator"
        ) {
          throw new AppError("FORBIDDEN");
        }
      }

      if (!authenticatedContext.project) {
        throw new AppError(
          "INTERNAL_ERROR",
          "Project context missing from authenticated server function",
        );
      }

      return next({
        context: {
          ...authenticatedContext,
          project: authenticatedContext.project,
          projectId: authenticatedContext.project.id,
        },
      });
    },
  );
}

export const requireProjectReadContext = [requireProject("read")] as const;
export const requireProjectContext = [requireProject("collaborate")] as const;
export const requireProjectAdminContext = [
  ...requireAuthenticatedContext,
  ...requireProjectContext,
] as const;

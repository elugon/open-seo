import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAuthMode } from "@/lib/auth-mode";
import { AppError } from "@/server/lib/errors";
import { ProjectAccessService } from "@/server/features/projects/services/ProjectAccessService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

function requireCloudflareAccessMode() {
  if (getAuthMode(env.AUTH_MODE) !== "cloudflare_access") {
    throw new AppError("NOT_FOUND");
  }
}

export const getProjectAssignments = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    requireCloudflareAccessMode();
    return ProjectAccessService.listAssignments(context);
  });

export const setProjectAssignment = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      memberId: z.string().min(1),
      projectId: z.string().min(1),
      role: z.enum(["viewer", "collaborator"]).nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    requireCloudflareAccessMode();
    await ProjectAccessService.setAssignment(context, data);
    return { success: true };
  });

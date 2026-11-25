import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProjectAccessSettings } from "@/client/features/team/ProjectAccessSettings";
import { getClientAuthMode } from "@/lib/auth-mode";
import { getProjectAssignments } from "@/serverFunctions/projectAccess";

export const Route = createFileRoute("/_app/settings/project-access")({
  beforeLoad: async () => {
    if (getClientAuthMode() !== "cloudflare_access") throw notFound();
    // This server-side call checks the actual admin allowlist before the route
    // renders; the client query then loads fresh data for normal invalidation.
    try {
      await getProjectAssignments();
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        throw notFound();
      }
      throw error;
    }
  },
  component: ProjectAccessSettings,
});

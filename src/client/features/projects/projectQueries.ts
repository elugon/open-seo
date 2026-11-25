import { queryOptions, useQuery } from "@tanstack/react-query";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { getClientAuthMode } from "@/lib/auth-mode";
import { getProjectAccess, getProjects } from "@/serverFunctions/projects";

// The org's active projects. Invalidating this key also refreshes the
// archived list, which lives under ["projects", "archived"].
export const projectsQueryOptions = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    ...(getClientAuthMode() === "cloudflare_access" && { staleTime: 0 }),
  });

export const projectAccessQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["projectAccess", projectId],
    queryFn: () => getProjectAccess({ data: { projectId } }),
    retry: false,
    staleTime: getClientAuthMode() === "cloudflare_access" ? 0 : Infinity,
  });

export function useCanManageProjects(ready = true) {
  const selfHostedWithAccess = getClientAuthMode() === "cloudflare_access";
  const { data } = useQuery({
    ...organizationContextQueryOptions(),
    enabled: ready && selfHostedWithAccess,
  });
  return !selfHostedWithAccess || data?.role === "owner";
}

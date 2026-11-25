import { queryOptions, useQuery } from "@tanstack/react-query";
import { hasOrgPermission } from "@/lib/org-permissions";
import { getOrganizationContext } from "@/serverFunctions/organization";
import { getClientAuthMode } from "@/lib/auth-mode";

export const organizationContextQueryOptions = () =>
  queryOptions({
    queryKey: ["organization-context"],
    queryFn: () => getOrganizationContext(),
    staleTime: 60 * 1000,
  });

// True while loading: the sole-owner workspace is the overwhelmingly common
// case, and every billing surface is enforced server-side anyway — favor not
// flashing "ask your owner" at actual owners. This is a deliberate cosmetic
// choice, not an authorization gate; the server always re-checks billing:manage.
export function useCanManageBilling() {
  const { data } = useQuery(organizationContextQueryOptions());
  return data ? hasOrgPermission(data.role, { billing: ["manage"] }) : true;
}

export function useCanManageProjects(ready = true) {
  const selfHostedWithAccess = getClientAuthMode() === "cloudflare_access";
  const { data } = useQuery({
    ...organizationContextQueryOptions(),
    enabled: ready && selfHostedWithAccess,
  });
  return !selfHostedWithAccess || data?.role === "owner";
}

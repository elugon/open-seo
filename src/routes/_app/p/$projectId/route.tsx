import {
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  clearLastProjectId,
  getLastProjectId,
  setLastProjectId,
} from "@/client/lib/active-project";
import { getErrorCode } from "@/client/lib/error-messages";
import {
  getCurrentAuthRedirectFromHref,
  getSignInSearch,
} from "@/lib/auth-redirect";
import { switchToProjectOrganization } from "@/serverFunctions/organization";
import { projectAccessQueryOptions } from "@/client/features/projects/projectQueries";
import { getClientAuthMode } from "@/lib/auth-mode";
import { DashboardSkeleton } from "@/client/features/dashboard/DashboardPage";

export const Route = createFileRoute("/_app/p/$projectId")({
  // Everything under this subtree fetches its data client-side with
  // react-query, so SSR would only render empty chrome.
  ssr: false,
  component: ProjectLayout,
});

function useProjectAccessRedirect(
  projectId: string,
  selfHostedWithAccess: boolean,
) {
  const navigate = useNavigate();
  const access = useQuery(projectAccessQueryOptions(projectId));
  const error = access.error;
  useEffect(() => {
    if (!error) return;
    if (getErrorCode(error) === "UNAUTHENTICATED") {
      void navigate({
        to: "/sign-in",
        search: getSignInSearch(
          getCurrentAuthRedirectFromHref(window.location.href),
        ),
        replace: true,
      });
      return;
    }
    if (selfHostedWithAccess) {
      if (getLastProjectId() === projectId) clearLastProjectId();
      void navigate({ to: "/projects", replace: true });
      return;
    }
    // The project may be in another of the user's organizations (one an
    // agent set up before they signed up, or a teammate's): open it there.
    // Otherwise forget it if it's the remembered project, or the landing
    // redirect would bring the user straight back here.
    switchToProjectOrganization({ data: { projectId } }).then(
      () => window.location.reload(),
      () => {
        if (getLastProjectId() === projectId) clearLastProjectId();
        void navigate({ to: "/", replace: true });
      },
    );
  }, [error, navigate, projectId, selfHostedWithAccess]);
  return {
    hasAccess:
      access.isSuccess && (!selfHostedWithAccess || access.isFetchedAfterMount),
    isViewer: selfHostedWithAccess && access.data?.accessRole === "viewer",
  };
}

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const selfHostedWithAccess = getClientAuthMode() === "cloudflare_access";
  const { hasAccess, isViewer } = useProjectAccessRedirect(
    projectId,
    selfHostedWithAccess,
  );

  // Remember this as the last-visited project for the landing redirect, once
  // the access check confirms it's one of the org's projects.
  // Settings and its sub-pages are excluded: editing another project's
  // settings is administration, not a context switch, so it shouldn't change
  // which project the app opens next time. (An explicit choice still counts:
  // the switcher and project creation set it themselves, settings page or not.)
  const isSettingsPage =
    useMatch({
      from: "/_app/p/$projectId/settings",
      shouldThrow: false,
      select: () => true,
    }) ?? false;
  useEffect(() => {
    if (!hasAccess || isSettingsPage) return;
    setLastProjectId(projectId);
  }, [projectId, hasAccess, isSettingsPage]);

  if (selfHostedWithAccess && !hasAccess) return <DashboardSkeleton />;
  if (!selfHostedWithAccess) return <Outlet />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isViewer ? (
        <p className="border-b bg-muted px-4 py-2 text-sm text-muted-foreground">
          You have read-only access to this project.
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

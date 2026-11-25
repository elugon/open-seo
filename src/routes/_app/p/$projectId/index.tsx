import { dashboardSearchSchema } from "@/types/schemas/dashboard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DashboardPage } from "@/client/features/dashboard/DashboardPage";
import { googleConnectionOptions } from "@/client/features/integrations/googleProviders";
import { pageHead } from "@/client/lib/pageHead";
import { queryClient } from "@/client/tanstack-db/queryClient";
import { projectAccessQueryOptions } from "@/client/features/projects/projectQueries";
import { getClientAuthMode } from "@/lib/auth-mode";
import { PageHeader } from "@/client/components/PageHeader";

export const Route = createFileRoute("/_app/p/$projectId/")({
  head: () => pageHead("Dashboard"),
  validateSearch: dashboardSearchSchema,
  loader: ({ params }) => {
    // Without Search Console, the dashboard opens on its connect card, which
    // needs this check: start it with the page's data, not after it.
    void queryClient.prefetchQuery(
      googleConnectionOptions("gsc", params.projectId),
    );
  },
  component: DashboardRoute,
});

function DashboardRoute() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: project } = useQuery({
    ...projectAccessQueryOptions(projectId),
    // The parent project layout fetches and checks access before mounting.
    enabled: false,
  });
  if (
    getClientAuthMode() === "cloudflare_access" &&
    project?.accessRole === "viewer"
  ) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-4 md:px-6 md:py-6">
        <PageHeader
          title={project.name}
          description={project.domain ?? undefined}
        />
        <div className="flex flex-wrap gap-4 text-sm font-medium underline">
          <Link to="/p/$projectId/reports" params={{ projectId }}>
            Reports
          </Link>
          <Link to="/p/$projectId/audit" params={{ projectId }}>
            Site audits
          </Link>
          <Link to="/p/$projectId/rank-tracking" params={{ projectId }}>
            Rank tracking
          </Link>
          <Link to="/p/$projectId/ai-visibility" params={{ projectId }}>
            AI visibility
          </Link>
        </div>
      </div>
    );
  }
  return (
    <DashboardPage
      key={projectId}
      projectId={projectId}
      tab={search.tab}
      onTabChange={(tab) => void navigate({ search: { tab } })}
    />
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError, QueryState } from "@/client/components/QueryState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { projectAssignmentsQueryOptions } from "@/client/features/team/projectAccessQueries";
import { setProjectAssignment } from "@/serverFunctions/projectAccess";

type AssignmentRole = "viewer" | "collaborator" | null;

export function ProjectAccessSettings() {
  const queryClient = useQueryClient();
  const assignmentsQuery = useQuery(projectAssignmentsQueryOptions());
  const mutation = useMutation({
    mutationFn: (input: {
      memberId: string;
      projectId: string;
      role: AssignmentRole;
    }) => setProjectAssignment({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectAssignmentsQueryOptions().queryKey,
      });
      toast.success("Project access updated");
    },
    onError: () => toast.error("We couldn't update project access. Try again."),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users and permissions"
        description="Choose which signed-in users can access each project. Cloudflare Access controls sign-in; these assignments control project visibility."
      />
      <QueryState
        query={assignmentsQuery}
        errorFallback="We couldn't load users and project access."
      >
        {(data) => (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Viewers can see project data. Collaborators can view and edit
              content, and run analyses.
            </p>
            {mutation.isError ? (
              <QueryError
                error={mutation.error}
                fallback="We couldn't update project access. Try again."
                variant="inline"
              />
            ) : null}
            {data.users.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                No signed-in users are available yet.
              </p>
            ) : (
              data.users.map((user) => (
                <section
                  key={user.memberId}
                  className="space-y-3 rounded-xl border border-border bg-card p-4"
                >
                  <div>
                    <h2 className="font-medium">{user.name || user.email}</h2>
                    <p className="text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  {data.projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No projects yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {data.projects.map((project) => {
                        const role =
                          data.assignments.find(
                            (assignment) =>
                              assignment.memberId === user.memberId &&
                              assignment.projectId === project.id,
                          )?.role ?? null;
                        const isSaving =
                          mutation.isPending &&
                          mutation.variables?.memberId === user.memberId &&
                          mutation.variables?.projectId === project.id;
                        return (
                          <li
                            key={project.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                          >
                            <span className="flex items-center gap-3 text-sm">
                              {project.name}
                              {isSaving ? (
                                <span
                                  className="text-xs text-muted-foreground"
                                  role="status"
                                >
                                  Saving…
                                </span>
                              ) : null}
                            </span>
                            <Select
                              value={role ?? "none"}
                              onValueChange={(value) => {
                                if (
                                  value !== "none" &&
                                  value !== "viewer" &&
                                  value !== "collaborator"
                                )
                                  return;
                                const nextRole =
                                  value === "none" ? null : value;
                                if (nextRole !== role) {
                                  mutation.mutate({
                                    memberId: user.memberId,
                                    projectId: project.id,
                                    role: nextRole,
                                  });
                                }
                              }}
                              disabled={mutation.isPending}
                            >
                              <SelectTrigger
                                aria-label={`Access for ${user.name || user.email} on ${project.name}`}
                                className="w-44"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No access</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                                <SelectItem value="collaborator">
                                  Collaborator
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}

import { queryOptions } from "@tanstack/react-query";
import { getProjectAssignments } from "@/serverFunctions/projectAccess";

export const projectAssignmentsQueryOptions = () =>
  queryOptions({
    queryKey: ["project-access", "assignments"],
    queryFn: () => getProjectAssignments(),
    staleTime: 30_000,
  });

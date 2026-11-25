import { env } from "cloudflare:workers";
import { getAuthMode } from "@/lib/auth-mode";
import { SHARED_WORKSPACE_ORGANIZATION_ID } from "@/server/auth/delegated-organization";
import { ProjectAccessRepository } from "@/server/features/projects/repositories/ProjectAccessRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { mapProject } from "@/server/features/projects/services/projects";
import { AppError } from "@/server/lib/errors";
import { hasOrgPermission } from "@/lib/org-permissions";

type ProjectAccessActor = {
  userId: string;
  organizationId: string;
  role: string;
};

type ProjectAccessRole = "viewer" | "collaborator" | "admin";

export function isProjectRestricted(actor: ProjectAccessActor) {
  return (
    getAuthMode(env.AUTH_MODE) === "cloudflare_access" &&
    actor.organizationId === SHARED_WORKSPACE_ORGANIZATION_ID &&
    actor.role !== "owner"
  );
}

function requireSharedWorkspaceAdmin(actor: ProjectAccessActor) {
  if (isProjectRestricted(actor)) throw new AppError("FORBIDDEN");
}

function requireAssignmentAdmin(actor: ProjectAccessActor) {
  if (!hasOrgPermission(actor.role, { organization: ["update"] })) {
    throw new AppError("FORBIDDEN");
  }
}

function withAccessRole<T extends object>(
  project: T,
  accessRole: ProjectAccessRole,
) {
  return { ...project, accessRole };
}

async function getProject(
  actor: ProjectAccessActor,
  projectId: string,
  permission: "read" | "collaborate" = "read",
) {
  if (isProjectRestricted(actor)) {
    const project = await ProjectAccessRepository.getAssignedProject(
      projectId,
      actor.organizationId,
      actor.userId,
    );
    if (!project) return null;
    if (permission === "collaborate" && project.role === "viewer")
      throw new AppError("FORBIDDEN");
    return withAccessRole(project, project.role);
  }

  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    actor.organizationId,
  );
  return project
    ? withAccessRole(project, actor.role === "owner" ? "admin" : "collaborator")
    : null;
}

async function listProjects(actor: ProjectAccessActor) {
  if (isProjectRestricted(actor)) {
    const projects = await ProjectAccessRepository.listAssignedProjects(
      actor.organizationId,
      actor.userId,
    );
    return projects.map((project) =>
      withAccessRole(mapProject(project), project.role),
    );
  }
  const projects = await ProjectRepository.listProjects(actor.organizationId);
  const accessRole = actor.role === "owner" ? "admin" : "collaborator";
  return projects.map((project) =>
    withAccessRole(mapProject(project), accessRole),
  );
}

async function getArchivedProject(
  actor: ProjectAccessActor,
  projectId: string,
) {
  requireSharedWorkspaceAdmin(actor);
  const project = await ProjectRepository.getArchivedProjectForOrganization(
    projectId,
    actor.organizationId,
  );
  return project ? withAccessRole(project, "admin") : null;
}

async function listArchivedProjects(actor: ProjectAccessActor) {
  requireSharedWorkspaceAdmin(actor);
  const projects = await ProjectRepository.listArchivedProjects(
    actor.organizationId,
  );
  return projects.map((project) => withAccessRole(project, "admin"));
}

async function listAssignments(actor: ProjectAccessActor) {
  requireAssignmentAdmin(actor);
  return ProjectAccessRepository.listAssignments(actor.organizationId);
}

async function setAssignment(
  actor: ProjectAccessActor,
  input: {
    memberId: string;
    projectId: string;
    role: "viewer" | "collaborator" | null;
  },
) {
  requireAssignmentAdmin(actor);
  const result = await ProjectAccessRepository.setAssignment(
    actor.organizationId,
    input,
  );
  if (result === "not-found") throw new AppError("NOT_FOUND");
  if (result === "owner") throw new AppError("FORBIDDEN");
}

export const ProjectAccessService = {
  getProject,
  listProjects,
  getArchivedProject,
  listArchivedProjects,
  listAssignments,
  setAssignment,
} as const;

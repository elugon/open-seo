import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectAccessRepository } from "@/server/features/projects/repositories/ProjectAccessRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  ProjectAccessService,
  isProjectRestricted,
} from "./ProjectAccessService";

const { testEnv } = vi.hoisted(() => ({
  testEnv: { AUTH_MODE: "cloudflare_access" as string },
}));

vi.mock("cloudflare:workers", () => ({ env: testEnv }));
vi.mock("@/server/auth/delegated-organization", () => ({
  SHARED_WORKSPACE_ORGANIZATION_ID: "shared-workspace",
}));
vi.mock(
  "@/server/features/projects/repositories/ProjectAccessRepository",
  () => ({
    ProjectAccessRepository: {
      getAssignedProject: vi.fn(),
      listAssignedProjects: vi.fn(),
      listAssignments: vi.fn(),
      setAssignment: vi.fn(),
    },
  }),
);
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: vi.fn(),
    listProjects: vi.fn(),
    getArchivedProjectForOrganization: vi.fn(),
    listArchivedProjects: vi.fn(),
  },
}));

const owner = {
  userId: "admin",
  organizationId: "shared-workspace",
  role: "owner",
};
const member = {
  userId: "member-user",
  organizationId: "shared-workspace",
  role: "member",
};

function projectRow() {
  return {
    id: "p1",
    organizationId: "shared-workspace",
    name: "Project",
    brandName: null,
    domain: null,
    locationCode: 2840,
    languageCode: "en",
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    aiResearchKeywords: null,
    indexnowKey: null,
  };
}

beforeEach(() => {
  testEnv.AUTH_MODE = "cloudflare_access";
  vi.mocked(ProjectRepository.getProjectForOrganization).mockResolvedValue(
    projectRow(),
  );
  vi.mocked(ProjectAccessRepository.getAssignedProject).mockResolvedValue(null);
  vi.mocked(ProjectRepository.listProjects).mockResolvedValue([]);
  vi.mocked(ProjectAccessRepository.listAssignedProjects).mockResolvedValue([]);
  vi.mocked(
    ProjectRepository.getArchivedProjectForOrganization,
  ).mockResolvedValue(projectRow());
  vi.mocked(ProjectRepository.listArchivedProjects).mockResolvedValue([]);
  vi.mocked(ProjectAccessRepository.listAssignments).mockResolvedValue({
    users: [],
    projects: [],
    assignments: [],
  });
  vi.mocked(ProjectAccessRepository.setAssignment).mockResolvedValue("updated");
});

describe("ProjectAccessService", () => {
  it("restricts only non-owner actors in the Cloudflare Access shared workspace", () => {
    expect(isProjectRestricted(member)).toBe(true);
    expect(isProjectRestricted(owner)).toBe(false);
    expect(
      isProjectRestricted({ ...member, organizationId: "other-org" }),
    ).toBe(false);
  });

  it("preserves shared-workspace access in password auth mode", () => {
    testEnv.AUTH_MODE = "password";
    expect(isProjectRestricted(member)).toBe(false);
  });

  it("returns accessible shared-workspace projects with their permission", async () => {
    vi.mocked(ProjectAccessRepository.getAssignedProject).mockResolvedValue({
      ...projectRow(),
      role: "collaborator",
    });
    await expect(
      ProjectAccessService.getProject(member, "p1", "collaborate"),
    ).resolves.toMatchObject({ id: "p1", accessRole: "collaborator" });
    await expect(
      ProjectAccessService.getProject(owner, "p1"),
    ).resolves.toMatchObject({ id: "p1", accessRole: "admin" });
  });

  it("hides unassigned projects and rejects collaboration for viewers", async () => {
    await expect(
      ProjectAccessService.getProject(member, "p1"),
    ).resolves.toBeNull();
    vi.mocked(ProjectAccessRepository.getAssignedProject).mockResolvedValue({
      ...projectRow(),
      role: "viewer",
    });
    await expect(
      ProjectAccessService.getProject(member, "p1", "collaborate"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists only active assigned projects for members and all active projects for admins", async () => {
    vi.mocked(ProjectAccessRepository.listAssignedProjects).mockResolvedValue([
      { ...projectRow(), role: "viewer", indexnowKey: "integration-key" },
    ]);
    vi.mocked(ProjectRepository.listProjects).mockResolvedValue([projectRow()]);
    const [assigned] = await ProjectAccessService.listProjects(member);
    expect(assigned).toMatchObject({ id: "p1", accessRole: "viewer" });
    expect(assigned).not.toHaveProperty("indexnowKey");
    await expect(
      ProjectAccessService.listProjects(owner),
    ).resolves.toMatchObject([{ id: "p1", accessRole: "admin" }]);
  });

  it("allows archived project visibility and assignment changes only to admins", async () => {
    await expect(
      ProjectAccessService.getArchivedProject(member, "p1"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      ProjectAccessService.listArchivedProjects(member),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      ProjectAccessService.listAssignments(member),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      ProjectAccessService.setAssignment(owner, {
        memberId: "m1",
        projectId: "p1",
        role: "viewer",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects member assignment changes before writing", async () => {
    await expect(
      ProjectAccessService.setAssignment(member, {
        memberId: "another-member",
        projectId: "p1",
        role: "collaborator",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(ProjectAccessRepository.setAssignment).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import {
  authorizeRestrictedMcpTool,
  classifyRestrictedMcpTool,
  requireMcpWorkspaceAdmin,
} from "@/server/mcp/project-access";
import { makeToolContext } from "@/server/mcp/tools/tool-test-support";

const accessMocks = vi.hoisted(() => ({
  isProjectRestricted: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectAccessService", () => ({
  isProjectRestricted: accessMocks.isProjectRestricted,
  ProjectAccessService: {
    getProject: accessMocks.getProject,
  },
}));

describe("authorizeRestrictedMcpTool", () => {
  beforeEach(() => {
    accessMocks.isProjectRestricted.mockReturnValue(true);
    accessMocks.getProject.mockResolvedValue({ id: "project_123" });
  });

  it("classifies safe projectless tools and keeps unapproved tools unclassified", () => {
    expect(classifyRestrictedMcpTool("whoami")).toBe("safe");
    expect(classifyRestrictedMcpTool("list_reports")).toBe("read");
    expect(classifyRestrictedMcpTool("run_site_audit")).toBe("collaborate");
    expect(classifyRestrictedMcpTool("create_project")).toBe("owner");
  });

  it("provides a direct owner guard for secret and public-sharing tool handlers", () => {
    expect(() =>
      requireMcpWorkspaceAdmin(makeToolContext({ role: "member" }).auth),
    ).toThrow();

    accessMocks.isProjectRestricted.mockReturnValue(false);
    expect(() =>
      requireMcpWorkspaceAdmin(makeToolContext().auth),
    ).not.toThrow();
  });

  it("allows read-only persisted results for an assigned project", async () => {
    const context = makeToolContext({ role: "member" });

    await authorizeRestrictedMcpTool(
      "list_reports",
      { projectId: "project_123" },
      context,
    );

    expect(accessMocks.getProject).toHaveBeenCalledWith(
      context.auth,
      "project_123",
      "read",
    );
  });

  it("requires collaboration access for mutations and provider-cost actions", async () => {
    const context = makeToolContext({ role: "member" });

    await authorizeRestrictedMcpTool(
      "run_site_audit",
      { projectId: "project_123" },
      context,
    );

    expect(accessMocks.getProject).toHaveBeenCalledWith(
      context.auth,
      "project_123",
      "collaborate",
    );
  });

  it("allows only explicitly safe projectless discovery tools", async () => {
    const context = makeToolContext({ role: "member" });

    await authorizeRestrictedMcpTool("search_serp_locations", {}, context);
    await expect(
      authorizeRestrictedMcpTool("create_project", {}, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(accessMocks.getProject).not.toHaveBeenCalled();
  });

  it("fails closed for unknown tools, missing project ids, and unauthorized projects", async () => {
    const context = makeToolContext({ role: "member" });
    accessMocks.getProject.mockResolvedValue(null);

    await expect(
      authorizeRestrictedMcpTool(
        "future_tool",
        { projectId: "project_123" },
        context,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      authorizeRestrictedMcpTool("list_reports", {}, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      authorizeRestrictedMcpTool(
        "list_reports",
        { projectId: "project_123" },
        context,
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("leaves existing unrestricted organizations unchanged", async () => {
    accessMocks.isProjectRestricted.mockReturnValue(false);

    await expect(
      authorizeRestrictedMcpTool("future_tool", {}, makeToolContext()),
    ).resolves.toBeUndefined();
    expect(accessMocks.getProject).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProjectsTool } from "@/server/mcp/tools/list-projects";
import { makeToolContext } from "@/server/mcp/tools/tool-test-support";

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  isProjectRestricted: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectAccessService", () => ({
  isProjectRestricted: mocks.isProjectRestricted,
  ProjectAccessService: { listProjects: mocks.listProjects },
}));

describe("list_projects tool", () => {
  beforeEach(() => {
    mocks.isProjectRestricted.mockReturnValue(true);
    mocks.listProjects.mockResolvedValue([
      {
        id: "assigned_project",
        name: "Assigned",
        domain: "assigned.example",
        locationCode: 2840,
        languageCode: "en",
      },
    ]);
  });

  it("lists only the projects returned for the current actor", async () => {
    const context = makeToolContext({ role: "member" });
    const result = await listProjectsTool.handler({}, context);

    expect(mocks.listProjects).toHaveBeenCalledWith(context.auth);
    expect(result.structuredContent?.projects).toEqual([
      expect.objectContaining({
        id: "assigned_project",
        url: "https://open-seo.test/p/assigned_project",
      }),
    ]);
  });

  it("does not tell a restricted member to create a project when none are assigned", async () => {
    mocks.listProjects.mockResolvedValue([]);

    const result = await listProjectsTool.handler(
      {},
      makeToolContext({ role: "member" }),
    );

    const text = result.content.find((item) => item.type === "text")?.text;
    expect(text).toContain("No projects are assigned");
    expect(text).not.toContain("call create_project");
  });
});

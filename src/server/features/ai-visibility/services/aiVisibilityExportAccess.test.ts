import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAiVisibilityDownload } from "./aiVisibilityExport";

const mocks = vi.hoisted(() => ({
  resolveUserContextFromHeaders: vi.fn(),
  getProject: vi.fn(),
  get: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: { R2: { get: mocks.get } } }));
vi.mock("@/middleware/ensure-user/resolve", () => ({
  resolveUserContextFromHeaders: mocks.resolveUserContextFromHeaders,
}));
vi.mock("@/server/features/projects/services/ProjectAccessService", () => ({
  ProjectAccessService: { getProject: mocks.getProject },
}));

beforeEach(() => {
  mocks.resolveUserContextFromHeaders.mockResolvedValue({
    userId: "user-1",
    userEmail: "viewer@example.com",
    organizationId: "org-1",
    role: "member",
  });
  mocks.getProject.mockResolvedValue(null);
  mocks.get.mockResolvedValue(null);
});

describe("handleAiVisibilityDownload", () => {
  it("does not fetch a private export for an unassigned project", async () => {
    const response = await handleAiVisibilityDownload(
      new Request(
        "https://app.example.com/api/ai-visibility/download?projectId=10000000-0000-4000-8000-000000000001&exportId=20000000-0000-4000-8000-000000000002",
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.getProject).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", organizationId: "org-1" }),
      "10000000-0000-4000-8000-000000000001",
      "read",
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  requireAuthenticatedContext,
  requirePersonalContext,
  requireProjectContext,
  requireProjectReadContext,
} from "./middleware";

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (handler: unknown) => handler }),
}));

vi.mock("@/middleware/ensureUser", () => ({ ensureUserMiddleware: {} }));
vi.mock("@/middleware/errorHandling", () => ({ errorHandlingMiddleware: {} }));

vi.mock("@/server/features/projects/services/ProjectAccessService", () => ({
  isProjectRestricted: (actor: { organizationId: string; role: string }) =>
    actor.organizationId === "shared-workspace" && actor.role !== "owner",
}));

const actor = {
  userId: "member",
  userEmail: "member@example.com",
  emailVerified: true,
  organizationId: "shared-workspace",
  role: "member",
};

function invoke(middleware: readonly unknown[], context: unknown) {
  const next = vi.fn();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The test's createMiddleware mock returns its server callback.
  const handler = middleware[0] as (options: {
    context: unknown;
    next: typeof next;
  }) => Promise<unknown>;
  return { result: handler({ context, next }), next };
}

describe("Cloudflare Access server function permissions", () => {
  it("allows personal context but blocks organization-wide operations", async () => {
    const personal = invoke(requirePersonalContext, actor);
    await personal.result;
    expect(personal.next).toHaveBeenCalledOnce();

    const global = invoke(requireAuthenticatedContext, actor);
    await expect(global.result).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(global.next).not.toHaveBeenCalled();
  });

  it("allows assigned viewers to read but prevents collaborator actions", async () => {
    const viewer = {
      ...actor,
      project: { id: "project" },
      projectAccessRole: "viewer",
    };
    const read = invoke(requireProjectReadContext, viewer);
    await read.result;
    expect(read.next).toHaveBeenCalledWith({
      context: { ...viewer, projectId: "project" },
    });

    const write = invoke(requireProjectContext, viewer);
    await expect(write.result).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(write.next).not.toHaveBeenCalled();
  });

  it("denies restricted requests without a verified assignment even if a project is present", async () => {
    const read = invoke(requireProjectReadContext, {
      ...actor,
      project: { id: "project" },
    });
    await expect(read.result).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(read.next).not.toHaveBeenCalled();
  });

  it("permits collaborator writes and preserves other organizations' behavior", async () => {
    for (const context of [
      {
        ...actor,
        project: { id: "project" },
        projectAccessRole: "collaborator",
      },
      { ...actor, organizationId: "hosted", project: { id: "project" } },
    ]) {
      const write = invoke(requireProjectContext, context);
      await write.result;
      expect(write.next).toHaveBeenCalledOnce();
    }
  });
});

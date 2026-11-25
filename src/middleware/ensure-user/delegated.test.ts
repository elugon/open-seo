import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUser, ensureSharedWorkspaceMembership } = vi.hoisted(() => ({
  findUser: vi.fn(),
  ensureSharedWorkspaceMembership: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { query: { user: { findFirst: findUser } } },
}));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/auth/delegated-organization", () => ({
  ensureDelegatedOrganizationForUser: vi.fn(),
  ensureSharedWorkspaceOrganization: vi.fn(async () => "shared-workspace"),
  ensureSharedWorkspaceMembership,
}));

import { resolveSharedWorkspaceContext } from "./delegated";

beforeEach(() => {
  findUser.mockImplementation(async () => ({ email: "admin@example.com" }));
});

describe("resolveSharedWorkspaceContext", () => {
  it("resolves owner only for the current configured admin email", async () => {
    await expect(
      resolveSharedWorkspaceContext(
        "admin-id",
        "Admin@Example.com",
        " admin@example.com ",
      ),
    ).resolves.toMatchObject({
      userEmail: "admin@example.com",
      role: "owner",
    });
    expect(ensureSharedWorkspaceMembership).toHaveBeenCalledWith(
      "admin-id",
      "owner",
    );
  });

  it("demotes the previous admin when the configured email changes", async () => {
    await expect(
      resolveSharedWorkspaceContext(
        "previous-admin-id",
        "admin@example.com",
        "next-admin@example.com",
      ),
    ).resolves.toMatchObject({ role: "member" });
    expect(ensureSharedWorkspaceMembership).toHaveBeenCalledWith(
      "previous-admin-id",
      "member",
    );
  });
});

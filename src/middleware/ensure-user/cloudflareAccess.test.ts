import { beforeEach, describe, expect, it, vi } from "vitest";

const { workerEnv, jwtVerify, resolveSharedWorkspaceContext } = vi.hoisted(
  () => ({
    workerEnv: {} as Record<string, string>,
    jwtVerify: vi.fn(),
    resolveSharedWorkspaceContext: vi.fn(),
  }),
);

vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify,
}));
vi.mock("./delegated", () => ({ resolveSharedWorkspaceContext }));

import { resolveCloudflareAccessContext } from "./cloudflareAccess";

beforeEach(() => {
  Object.assign(workerEnv, {
    TEAM_DOMAIN: "https://team.cloudflareaccess.com",
    POLICY_AUD: "audience",
    SELFHOST_ADMIN_EMAIL: "ELUGON10@GMAIL.COM ",
  });
  jwtVerify.mockResolvedValue({
    payload: { sub: "user_1", email: " Elugon10@Gmail.com " },
  });
  resolveSharedWorkspaceContext.mockResolvedValue({
    userId: "user_1",
    userEmail: "elugon10@gmail.com",
    emailVerified: true,
    organizationId: "shared-workspace",
    role: "owner",
  });
});

describe("AUTH_MODE=cloudflare_access identity bootstrap", () => {
  it("uses the verified normalized email to resolve the configured initial admin", async () => {
    await resolveCloudflareAccessContext(
      new Headers({ "cf-access-jwt-assertion": "verified-token" }),
    );

    expect(resolveSharedWorkspaceContext).toHaveBeenCalledWith(
      "user_1",
      "elugon10@gmail.com",
      "elugon10@gmail.com",
    );
  });

  it("does not fall back to an owner when the configured admin is missing", async () => {
    delete workerEnv.SELFHOST_ADMIN_EMAIL;

    await expect(
      resolveCloudflareAccessContext(
        new Headers({ "cf-access-jwt-assertion": "verified-token" }),
      ),
    ).rejects.toMatchObject({ code: "AUTH_CONFIG_MISSING" });
    expect(resolveSharedWorkspaceContext).not.toHaveBeenCalled();
  });
});

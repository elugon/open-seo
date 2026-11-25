import { describe, expect, it } from "vitest";
import {
  getSelfhostAdminEmails,
  isTelemetryOptOutValue,
  looksLikeDataForSeoKey,
  parseSelfhostAdminEmails,
  validateTeamDomain,
} from "./selfhost-checks";

describe("validateTeamDomain", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(
      validateTeamDomain(" https://your-team.cloudflareaccess.com/ "),
    ).toEqual({ ok: true, origin: "https://your-team.cloudflareaccess.com" });
  });

  it("rejects a bare hostname and tells the user to add https://", () => {
    const result = validateTeamDomain("your-team.cloudflareaccess.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("https://");
      expect(result.message).toContain(
        'add the https:// prefix to "your-team.cloudflareaccess.com"',
      );
    }
  });

  it("rejects http://", () => {
    const result = validateTeamDomain("http://your-team.cloudflareaccess.com");
    expect(result.ok).toBe(false);
  });
});

describe("looksLikeDataForSeoKey", () => {
  it("accepts base64 of login:password, tolerating surrounding whitespace", () => {
    expect(looksLikeDataForSeoKey(btoa("user@example.com:secret"))).toBe(true);
    expect(looksLikeDataForSeoKey(` ${btoa("a:b")} `)).toBe(true);
  });

  it("rejects a raw dashboard API key", () => {
    expect(looksLikeDataForSeoKey("0123456789abcdef0123")).toBe(false);
  });
});

describe("isTelemetryOptOutValue", () => {
  it('treats "1" and "true" as opted out', () => {
    expect(isTelemetryOptOutValue("1")).toBe(true);
    expect(isTelemetryOptOutValue("true")).toBe(true);
  });

  it.each([undefined, null, "", "0", "false", "no", "OFF"])(
    "treats %j as opted in",
    (value) => {
      expect(isTelemetryOptOutValue(value)).toBe(false);
    },
  );
});

describe("self-host administrator email configuration", () => {
  it("normalizes and deduplicates a comma-separated administrator list", () => {
    expect(
      parseSelfhostAdminEmails(
        " Admin@Example.com,admin@example.com,other@example.com ",
      ),
    ).toEqual(["admin@example.com", "other@example.com"]);
  });

  it("returns null when no administrator email is configured", () => {
    expect(parseSelfhostAdminEmails(undefined)).toBeNull();
    expect(parseSelfhostAdminEmails("  ")).toBeNull();
  });

  it("rejects malformed and empty list entries", () => {
    expect(() =>
      parseSelfhostAdminEmails("admin@example.com,not-an-email"),
    ).toThrow("SELFHOST_ADMIN_EMAILS");
    expect(() =>
      parseSelfhostAdminEmails("admin@example.com,,other@example.com"),
    ).toThrow("SELFHOST_ADMIN_EMAILS");
  });

  it("prefers the plural setting and falls back to the legacy singular setting", () => {
    expect(
      getSelfhostAdminEmails("new@example.com", "old@example.com"),
    ).toEqual(["new@example.com"]);
    expect(getSelfhostAdminEmails(undefined, "old@example.com")).toEqual([
      "old@example.com",
    ]);
  });
});

import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as appSchema from "@/db/app.schema";
import * as authSchema from "@/db/better-auth-schema";
import { ProjectAccessRepository } from "./ProjectAccessRepository";

const { databaseState } = vi.hoisted(() => ({
  databaseState: { db: null as unknown },
}));

vi.mock("@/db", () => ({
  get db() {
    return databaseState.db;
  },
}));
vi.mock("@/db/schema", async () => ({
  ...(await vi.importActual<typeof appSchema>("@/db/app.schema")),
  ...(await vi.importActual<typeof authSchema>("@/db/better-auth-schema")),
}));

let client: Client;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  databaseState.db = drizzle(client, {
    schema: { ...appSchema, ...authSchema },
  });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE organization (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, created_at INTEGER);
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL);
    CREATE TABLE member (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, role TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name TEXT NOT NULL, brand_name TEXT, domain TEXT, location_code INTEGER NOT NULL DEFAULT 2840,
      language_code TEXT NOT NULL DEFAULT 'en', created_at TEXT NOT NULL, archived_at TEXT,
      ai_research_keywords TEXT, indexnow_key TEXT
    );
  `);
  await client.executeMultiple(
    readFileSync("drizzle/sqlite/0075_luxuriant_maestro.sql", "utf8"),
  );
});

afterAll(() => client.close());

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM project_access_assignments;
    DELETE FROM projects;
    DELETE FROM member;
    DELETE FROM user;
    DELETE FROM organization;
    INSERT INTO organization (id, name, slug) VALUES ('shared-workspace', 'Shared', 'shared-workspace'), ('other-org', 'Other', 'other-org');
    INSERT INTO user (id, name, email) VALUES ('admin-user', 'Admin', 'admin@example.com'), ('member-user', 'Member', 'member@example.com'), ('other-user', 'Other', 'other@example.com');
    INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
      ('admin-member', 'shared-workspace', 'admin-user', 'owner', 1),
      ('shared-member', 'shared-workspace', 'member-user', 'member', 2),
      ('other-member', 'other-org', 'other-user', 'member', 3);
    INSERT INTO projects (id, organization_id, name, created_at) VALUES
      ('shared-project', 'shared-workspace', 'Shared project', '2026-01-01'),
      ('other-project', 'other-org', 'Other project', '2026-01-02');
  `);
});

describe("ProjectAccessRepository tenant scoping", () => {
  it("creates, changes, and revokes an assignment with consistent lookup and list results", async () => {
    const input = {
      memberId: "shared-member",
      projectId: "shared-project",
    };
    await expect(
      ProjectAccessRepository.setAssignment("shared-workspace", {
        ...input,
        role: "viewer",
      }),
    ).resolves.toBe("updated");
    await expect(
      ProjectAccessRepository.getAssignedProject(
        input.projectId,
        "shared-workspace",
        "member-user",
      ),
    ).resolves.toMatchObject({ role: "viewer" });
    await expect(
      ProjectAccessRepository.listAssignedProjects(
        "shared-workspace",
        "member-user",
      ),
    ).resolves.toMatchObject([{ role: "viewer" }]);

    await expect(
      ProjectAccessRepository.setAssignment("shared-workspace", {
        ...input,
        role: "collaborator",
      }),
    ).resolves.toBe("updated");
    await expect(
      ProjectAccessRepository.getAssignedProject(
        input.projectId,
        "shared-workspace",
        "member-user",
      ),
    ).resolves.toMatchObject({ role: "collaborator" });
    await expect(
      ProjectAccessRepository.listAssignedProjects(
        "shared-workspace",
        "member-user",
      ),
    ).resolves.toMatchObject([{ role: "collaborator" }]);

    await expect(
      ProjectAccessRepository.setAssignment("shared-workspace", {
        ...input,
        role: null,
      }),
    ).resolves.toBe("updated");
    await expect(
      ProjectAccessRepository.getAssignedProject(
        input.projectId,
        "shared-workspace",
        "member-user",
      ),
    ).resolves.toBeNull();
    await expect(
      ProjectAccessRepository.listAssignedProjects(
        "shared-workspace",
        "member-user",
      ),
    ).resolves.toEqual([]);
  });

  it("does not read or write assignments across organizations", async () => {
    await expect(
      ProjectAccessRepository.setAssignment("shared-workspace", {
        memberId: "shared-member",
        projectId: "other-project",
        role: "collaborator",
      }),
    ).resolves.toBe("not-found");

    await client.execute({
      sql: "INSERT INTO project_access_assignments (member_id, project_id, role) VALUES (?, ?, ?)",
      args: ["shared-member", "other-project", "collaborator"],
    });
    await expect(
      ProjectAccessRepository.getAssignedProject(
        "other-project",
        "shared-workspace",
        "member-user",
      ),
    ).resolves.toBeNull();
    await expect(
      ProjectAccessRepository.listAssignedProjects(
        "shared-workspace",
        "member-user",
      ),
    ).resolves.toEqual([]);
    await expect(
      ProjectAccessRepository.listAssignments("shared-workspace"),
    ).resolves.toMatchObject({
      projects: [{ id: "shared-project" }],
      assignments: [],
    });
  });

  it("prevents assignment edits for an actual organization owner", async () => {
    await expect(
      ProjectAccessRepository.setAssignment("shared-workspace", {
        memberId: "admin-member",
        projectId: "shared-project",
        role: "viewer",
      }),
    ).resolves.toBe("owner");
    await expect(
      ProjectAccessRepository.listAssignments("shared-workspace"),
    ).resolves.toMatchObject({
      users: [{ memberId: "shared-member", userId: "member-user" }],
    });
  });
});

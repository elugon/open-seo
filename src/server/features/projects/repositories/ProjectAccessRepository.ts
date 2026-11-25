import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { member, projectAccessAssignments, projects, user } from "@/db/schema";

async function getAssignedProject(
  projectId: string,
  organizationId: string,
  userId: string,
) {
  const [row] = await db
    .select({ project: projects, role: projectAccessAssignments.role })
    .from(projects)
    .innerJoin(
      projectAccessAssignments,
      eq(projectAccessAssignments.projectId, projects.id),
    )
    .innerJoin(member, eq(member.id, projectAccessAssignments.memberId))
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
        eq(member.organizationId, organizationId),
        eq(member.userId, userId),
        isNull(projects.archivedAt),
      ),
    )
    .limit(1);
  return row ? { ...row.project, role: row.role } : null;
}

async function listAssignedProjects(organizationId: string, userId: string) {
  return db
    .select({ project: projects, role: projectAccessAssignments.role })
    .from(projects)
    .innerJoin(
      projectAccessAssignments,
      eq(projectAccessAssignments.projectId, projects.id),
    )
    .innerJoin(member, eq(member.id, projectAccessAssignments.memberId))
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(member.organizationId, organizationId),
        eq(member.userId, userId),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .then((rows) => rows.map((row) => ({ ...row.project, role: row.role })));
}

async function listAssignments(organizationId: string) {
  const [users, projectRows, assignmentRows] = await Promise.all([
    db
      .select({
        memberId: member.id,
        userId: member.userId,
        name: user.name,
        email: user.email,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, organizationId),
          ne(member.role, "owner"),
        ),
      ),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, organizationId),
          isNull(projects.archivedAt),
        ),
      )
      .orderBy(projects.name, projects.id),
    db
      .select({
        memberId: projectAccessAssignments.memberId,
        projectId: projectAccessAssignments.projectId,
        role: projectAccessAssignments.role,
      })
      .from(projectAccessAssignments)
      .innerJoin(member, eq(member.id, projectAccessAssignments.memberId))
      .innerJoin(projects, eq(projects.id, projectAccessAssignments.projectId))
      .where(
        and(
          eq(member.organizationId, organizationId),
          ne(member.role, "owner"),
          eq(projects.organizationId, organizationId),
          isNull(projects.archivedAt),
        ),
      ),
  ]);
  return { users, projects: projectRows, assignments: assignmentRows };
}

async function setAssignment(
  organizationId: string,
  input: {
    memberId: string;
    projectId: string;
    role: "viewer" | "collaborator" | null;
  },
) {
  const [eligible] = await db
    .select({ memberRole: member.role })
    .from(member)
    .innerJoin(projects, eq(projects.organizationId, member.organizationId))
    .where(
      and(
        eq(member.id, input.memberId),
        eq(member.organizationId, organizationId),
        eq(projects.id, input.projectId),
        eq(projects.organizationId, organizationId),
        isNull(projects.archivedAt),
      ),
    )
    .limit(1);
  if (!eligible) return "not-found" as const;
  if (eligible.memberRole === "owner") return "owner" as const;

  if (input.role === null) {
    await db
      .delete(projectAccessAssignments)
      .where(
        and(
          eq(projectAccessAssignments.memberId, input.memberId),
          eq(projectAccessAssignments.projectId, input.projectId),
        ),
      );
    return "updated" as const;
  }

  await db
    .insert(projectAccessAssignments)
    .values({
      memberId: input.memberId,
      projectId: input.projectId,
      role: input.role,
    })
    .onConflictDoUpdate({
      target: [
        projectAccessAssignments.memberId,
        projectAccessAssignments.projectId,
      ],
      set: { role: input.role },
    });
  return "updated" as const;
}

export const ProjectAccessRepository = {
  getAssignedProject,
  listAssignedProjects,
  listAssignments,
  setAssignment,
} as const;

import { randomUUID } from "crypto";
import type { Sql } from "postgres";
import { expect } from "vitest";

export const preMigration = async (sql: Sql) => {
  const projectId = `test-${randomUUID()}`;
  const tenancyId = randomUUID();

  await sql`INSERT INTO "Project" ("id", "createdAt", "updatedAt", "displayName", "description", "isProductionMode") VALUES (${projectId}, NOW(), NOW(), 'Test', '', false)`;
  await sql`INSERT INTO "Tenancy" ("id", "createdAt", "updatedAt", "projectId", "branchId", "hasNoOrganization") VALUES (${tenancyId}::uuid, NOW(), NOW(), ${projectId}, 'main', 'TRUE'::"BooleanTrue")`;

  return { tenancyId };
};

export const postMigration = async (sql: Sql, ctx: Awaited<ReturnType<typeof preMigration>>) => {
  await sql`
    INSERT INTO "BlockedEmail" ("tenancyId", "email", "publicReason", "privateDetails")
    VALUES (${ctx.tenancyId}::uuid, 'blocked@example.com', 'reason', 'details')
  `;

  await expect(sql`
    INSERT INTO "BlockedEmail" ("tenancyId", "email")
    VALUES (${ctx.tenancyId}::uuid, 'blocked@example.com')
  `).rejects.toThrow(/BlockedEmail_tenancyId_email_key/);
};

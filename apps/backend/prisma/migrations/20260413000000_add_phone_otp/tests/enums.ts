import type { Sql } from 'postgres';
import { expect } from 'vitest';

export const postMigration = async (sql: Sql) => {
  const contactChannelTypes = await sql`SELECT unnest(enum_range(NULL::"ContactChannelType"))::text AS value`;
  const verificationCodeTypes = await sql`SELECT unnest(enum_range(NULL::"VerificationCodeType"))::text AS value`;

  expect(contactChannelTypes.map((row) => row.value)).toContain("PHONE");
  expect(verificationCodeTypes.map((row) => row.value)).toContain("PHONE_OTP");
};

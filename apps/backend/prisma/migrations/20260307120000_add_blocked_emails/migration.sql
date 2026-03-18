CREATE TABLE "BlockedEmail" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenancyId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "publicReason" TEXT,
  "privateDetails" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BlockedEmail_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BlockedEmail"
  ADD CONSTRAINT "BlockedEmail_tenancyId_fkey"
  FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "BlockedEmail_tenancyId_email_key" ON "BlockedEmail"("tenancyId", "email");
CREATE INDEX "BlockedEmail_tenancyId_createdAt_idx" ON "BlockedEmail"("tenancyId", "createdAt");

import { applyBlockedEmailRestrictionToCurrentUser, normalizeBlockedEmail, removeBlockedEmailRestrictionFromCurrentUser } from "@/lib/blocked-emails";
import { getPrismaClientForTenancy, retryTransaction } from "@/prisma-client";
import { createCrudHandlers } from "@/route-handlers/crud-handler";
import { blockedEmailsCrud } from "@stackframe/stack-shared/dist/interface/crud/blocked-emails";
import { yupObject, yupString } from "@stackframe/stack-shared/dist/schema-fields";
import { createLazyProxy } from "@stackframe/stack-shared/dist/utils/proxies";

function blockedEmailPrismaToCrud(prisma: {
  id: string,
  email: string,
  publicReason: string | null,
  privateDetails: string | null,
  createdAt: Date,
  updatedAt: Date,
  createdByUserId: string | null,
}) {
  return {
    id: prisma.id,
    email: prisma.email,
    public_reason: prisma.publicReason,
    private_details: prisma.privateDetails,
    created_at_millis: prisma.createdAt.getTime(),
    updated_at_millis: prisma.updatedAt.getTime(),
    created_by_user_id: prisma.createdByUserId,
  };
}

export const blockedEmailsCrudHandlers = createLazyProxy(() => createCrudHandlers(blockedEmailsCrud, {
  paramsSchema: yupObject({
    blocked_email_id: yupString().uuid().optional(),
  }),
  querySchema: yupObject({
    email: yupString().email().optional(),
  }),
  onList: async ({ auth, query }) => {
    const prisma = await getPrismaClientForTenancy(auth.tenancy);
    const email = query.email != null ? normalizeBlockedEmail(query.email) : undefined;
    const blockedEmails = await prisma.blockedEmail.findMany({
      where: {
        tenancyId: auth.tenancy.id,
        ...email != null ? { email } : {},
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      items: blockedEmails.map(blockedEmailPrismaToCrud),
      is_paginated: false,
    };
  },
  onCreate: async ({ auth, data }) => {
    const prisma = await getPrismaClientForTenancy(auth.tenancy);
    const normalizedEmail = normalizeBlockedEmail(data.email);
    const blockedEmail = await retryTransaction(prisma, async (tx) => {
      const db = await tx.blockedEmail.upsert({
        where: {
          tenancyId_email: {
            tenancyId: auth.tenancy.id,
            email: normalizedEmail,
          },
        },
        create: {
          tenancyId: auth.tenancy.id,
          email: normalizedEmail,
          publicReason: data.public_reason ?? null,
          privateDetails: data.private_details ?? null,
          createdByUserId: auth.user?.id ?? null,
        },
        update: {
          publicReason: data.public_reason ?? null,
          privateDetails: data.private_details ?? null,
          createdByUserId: auth.user?.id ?? null,
        },
      });
      await applyBlockedEmailRestrictionToCurrentUser(tx, {
        tenancyId: auth.tenancy.id,
        normalizedEmail,
        publicReason: db.publicReason,
      });
      return db;
    });

    return blockedEmailPrismaToCrud(blockedEmail);
  },
  onDelete: async ({ auth, params }) => {
    const prisma = await getPrismaClientForTenancy(auth.tenancy);
    await retryTransaction(prisma, async (tx) => {
      const blockedEmail = await tx.blockedEmail.findFirstOrThrow({
        where: {
          id: params.blocked_email_id,
          tenancyId: auth.tenancy.id,
        },
      });
      await tx.blockedEmail.delete({
        where: {
          id: blockedEmail.id,
        },
      });
      await removeBlockedEmailRestrictionFromCurrentUser(tx, {
        tenancyId: auth.tenancy.id,
        normalizedEmail: blockedEmail.email,
        publicReason: blockedEmail.publicReason,
      });
    });
  },
}));

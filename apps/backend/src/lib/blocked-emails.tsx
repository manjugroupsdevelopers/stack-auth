import { getAuthContactChannelWithEmailNormalization } from "@/lib/contact-channel";
import { normalizeEmail } from "@/lib/emails";
import { PrismaClientTransaction } from "@/prisma-client";
import { KnownErrors } from "@stackframe/stack-shared";

const blockedEmailMarkerPrefix = "[stack-email-block:";

export function normalizeBlockedEmail(email: string): string {
  return normalizeEmail(email);
}

export function createBlockedEmailMarker(normalizedEmail: string): string {
  return `${blockedEmailMarkerPrefix}${normalizedEmail}]`;
}

function splitPrivateDetails(privateDetails: string | null | undefined): string[] {
  return (privateDetails ?? "")
    .split("\n\n")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function joinPrivateDetails(parts: string[]): string | null {
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export function addBlockedEmailMarker(privateDetails: string | null | undefined, normalizedEmail: string): string {
  const marker = createBlockedEmailMarker(normalizedEmail);
  const parts = splitPrivateDetails(privateDetails);
  if (!parts.includes(marker)) {
    parts.push(marker);
  }
  return parts.join("\n\n");
}

export function removeBlockedEmailMarker(privateDetails: string | null | undefined, normalizedEmail: string): string | null {
  const marker = createBlockedEmailMarker(normalizedEmail);
  return joinPrivateDetails(splitPrivateDetails(privateDetails).filter((part) => part !== marker));
}

export function hasBlockedEmailMarker(privateDetails: string | null | undefined, normalizedEmail: string): boolean {
  const marker = createBlockedEmailMarker(normalizedEmail);
  return splitPrivateDetails(privateDetails).includes(marker);
}

export async function getBlockedEmailRecord(
  tx: PrismaClientTransaction,
  options: {
    tenancyId: string,
    normalizedEmail: string,
  },
) {
  return await tx.blockedEmail.findUnique({
    where: {
      tenancyId_email: {
        tenancyId: options.tenancyId,
        email: options.normalizedEmail,
      },
    },
  });
}

export async function assertEmailNotBlockedForSignup(
  tx: PrismaClientTransaction,
  options: {
    tenancyId: string,
    email: string,
  },
): Promise<void> {
  const normalizedEmail = normalizeBlockedEmail(options.email);
  const blockedEmail = await getBlockedEmailRecord(tx, {
    tenancyId: options.tenancyId,
    normalizedEmail,
  });
  if (blockedEmail) {
    throw new KnownErrors.BlockedEmailSignUpNotAllowed(blockedEmail.publicReason ?? undefined);
  }
}

export async function applyBlockedEmailRestrictionToCurrentUser(
  tx: PrismaClientTransaction,
  options: {
    tenancyId: string,
    normalizedEmail: string,
    publicReason: string | null,
  },
): Promise<void> {
  const contactChannel = await getAuthContactChannelWithEmailNormalization(tx, {
    tenancyId: options.tenancyId,
    type: "EMAIL",
    value: options.normalizedEmail,
  });
  if (!contactChannel) {
    return;
  }

  const nextPrivateDetails = addBlockedEmailMarker(
    contactChannel.projectUser.restrictedByAdminPrivateDetails,
    options.normalizedEmail,
  );

  await tx.projectUser.update({
    where: {
      tenancyId_projectUserId: {
        tenancyId: options.tenancyId,
        projectUserId: contactChannel.projectUser.projectUserId,
      },
    },
    data: {
      restrictedByAdmin: true,
      restrictedByAdminReason: contactChannel.projectUser.restrictedByAdmin
        ? contactChannel.projectUser.restrictedByAdminReason
        : options.publicReason,
      restrictedByAdminPrivateDetails: nextPrivateDetails,
    },
  });
}

export async function removeBlockedEmailRestrictionFromCurrentUser(
  tx: PrismaClientTransaction,
  options: {
    tenancyId: string,
    normalizedEmail: string,
    publicReason: string | null,
  },
): Promise<void> {
  const contactChannel = await getAuthContactChannelWithEmailNormalization(tx, {
    tenancyId: options.tenancyId,
    type: "EMAIL",
    value: options.normalizedEmail,
  });
  if (!contactChannel) {
    return;
  }
  if (!hasBlockedEmailMarker(contactChannel.projectUser.restrictedByAdminPrivateDetails, options.normalizedEmail)) {
    return;
  }

  const remainingPrivateDetails = removeBlockedEmailMarker(
    contactChannel.projectUser.restrictedByAdminPrivateDetails,
    options.normalizedEmail,
  );
  const shouldClearRestriction = remainingPrivateDetails == null
    && (contactChannel.projectUser.restrictedByAdminReason ?? null) === options.publicReason;

  await tx.projectUser.update({
    where: {
      tenancyId_projectUserId: {
        tenancyId: options.tenancyId,
        projectUserId: contactChannel.projectUser.projectUserId,
      },
    },
    data: shouldClearRestriction
      ? {
        restrictedByAdmin: false,
        restrictedByAdminReason: null,
        restrictedByAdminPrivateDetails: null,
      }
      : {
        restrictedByAdmin: true,
        restrictedByAdminPrivateDetails: remainingPrivateDetails,
      },
  });
}

export type BlockedEmail = {
  id: string,
  email: string,
  publicReason: string | null,
  privateDetails: string | null,
  createdAt: Date,
  updatedAt: Date,
  createdByUserId: string | null,
};

export type BlockedEmailCreateOptions = {
  email: string,
  publicReason?: string | null,
  privateDetails?: string | null,
};

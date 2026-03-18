import { CrudTypeOf, createCrud } from "../../crud";
import { yupMixed, yupNumber, yupObject, yupString } from "../../schema-fields";

export const blockedEmailsCrudAdminReadSchema = yupObject({
  id: yupString().uuid().defined(),
  email: yupString().email().defined(),
  public_reason: yupString().nullable().defined(),
  private_details: yupString().nullable().defined(),
  created_at_millis: yupNumber().defined(),
  updated_at_millis: yupNumber().defined(),
  created_by_user_id: yupString().uuid().nullable().defined(),
}).defined();

export const blockedEmailsCrudAdminCreateSchema = yupObject({
  email: yupString().email().defined(),
  public_reason: yupString().nullable().optional(),
  private_details: yupString().nullable().optional(),
}).defined();

export const blockedEmailsCrudAdminDeleteSchema = yupMixed();

export const blockedEmailsCrud = createCrud({
  adminReadSchema: blockedEmailsCrudAdminReadSchema,
  adminCreateSchema: blockedEmailsCrudAdminCreateSchema,
  adminDeleteSchema: blockedEmailsCrudAdminDeleteSchema,
  docs: {
    adminCreate: {
      tags: ["Blocked Emails"],
      summary: "Block email",
      description: "Blocks a normalized email from future signups in this project.",
    },
    adminList: {
      tags: ["Blocked Emails"],
      summary: "List blocked emails",
      description: "Lists blocked emails in this project.",
    },
    adminDelete: {
      tags: ["Blocked Emails"],
      summary: "Unblock email",
      description: "Removes a blocked email entry from this project.",
    },
  },
});

export type BlockedEmailsCrud = CrudTypeOf<typeof blockedEmailsCrud>;

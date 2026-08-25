import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";

const statement = {
  ...defaultStatements,
} as const;

export const ac = createAccessControl(statement);

/** Full access, including user management. */
export const admin = ac.newRole({
  ...adminAc.statements,
});

/** Catalog access — upload/edit, no user management. */
export const editor = ac.newRole({
  ...userAc.statements,
});

/** Browse available tracks + playlists only — no upload/edit/admin. */
export const subscriber = ac.newRole({
  ...userAc.statements,
});

export const appRoles = {
  admin,
  editor,
  subscriber,
} as const;

export type AppRole = keyof typeof appRoles;

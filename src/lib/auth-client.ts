import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";
import { ac, admin, editor, subscriber } from "@/lib/auth-permissions";

export const authClient = createAuthClient({
  plugins: [
    adminClient({
      ac,
      roles: {
        admin,
        editor,
        subscriber,
      },
    }),
    inferAdditionalFields<typeof auth>(),
  ],
});

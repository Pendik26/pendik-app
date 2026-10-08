import { betterAuth, type BetterAuthOptions } from "better-auth";

export interface AuthConfig {
  database: BetterAuthOptions["database"];
  secret: string;
  /** Public origin of the app, e.g. https://medicine.vercel.app. Inferred from requests if unset. */
  baseURL?: string;
  trustedOrigins: string[];
  google?: { clientId: string; clientSecret: string };
  /** Removes everything else stored for a user when they delete their account. */
  onDeleteUser: (userId: string) => Promise<void>;
  /**
   * Rate-limit storage: "database" in production, where each function instance has its own
   * memory; false turns limiting off (tests, local dev).
   */
  rateLimit: "memory" | "database" | false;
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    appName: "Medicine",
    database: config.database,
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    socialProviders: config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret,
            // Always show the account chooser: students often share laptops and phones.
            prompt: "select_account",
          },
        }
      : undefined,
    account: {
      accountLinking: {
        enabled: true,
        // A signed-in student can connect Google to their account from the Account page (Google
        // proves the address). Signing in with Google does NOT silently join an existing
        // password account whose email was never verified: someone could have registered that
        // address first with a password they know. Those students sign in with the password and
        // connect Google instead (the Account page explains, from ?error=account_not_linked).
        trustedProviders: ["google"],
      },
      // Google's tokens are only needed during sign-in; keep the stored copies encrypted.
      encryptOAuthTokens: true,
    },
    // OAuth errors (a cancelled Google sign-in, an unlinked account) come back to the Account
    // page as ?error=<code>, not to Better Auth's bare error page.
    onAPIError: { errorURL: "/account" },
    user: {
      additionalFields: {
        // Cohort (angkatan), e.g. "2025"; used later to compare scores within a class.
        cohort: { type: "string", required: false, input: true },
      },
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await config.onDeleteUser(user.id);
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 60, // 60 days: a study app should not keep asking students to sign in
      updateAge: 60 * 60 * 24,
      // The session and user are kept in a signed cookie for five minutes, so routes that only
      // read (the Drive, the class average) don't look up two documents in MongoDB each time.
      // Everything else skips the cache (see sessionUser in app.ts).
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: config.rateLimit ? { enabled: true, storage: config.rateLimit } : { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

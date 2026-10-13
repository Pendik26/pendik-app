import { betterAuth, type BetterAuthOptions } from "better-auth";

// Sign-in with Better Auth on MongoDB. Students don't register: an admin activates them from the
// roster (server/accounts.ts), which creates their user with the sign-in address
// `<student id>@pendik26.internal` and a first password. They can link Google afterwards.

export interface AuthConfig {
  database: BetterAuthOptions["database"];
  secret: string;
  /** Public origin of the app, e.g. https://pendik-app.vercel.app. Inferred from requests if unset. */
  baseURL?: string;
  trustedOrigins: string[];
  google?: { clientId: string; clientSecret: string };
  /** Whether this account was locked by an admin: a locked account can't start a session. */
  isLocked: (userId: string) => Promise<boolean>;
  /** "database" in production, where each function instance has its own memory; false turns limiting off (tests, local dev). */
  rateLimit: "memory" | "database" | false;
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    appName: "Pendik",
    database: config.database,
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      // Accounts come from the roster; nobody signs themselves up.
      disableSignUp: true,
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
            // Google only signs in an account that was linked from the Account page.
            disableImplicitSignUp: true,
          },
        }
      : undefined,
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"], allowDifferentEmails: true },
      encryptOAuthTokens: true,
    },
    // OAuth errors (a cancelled Google sign-in, an unlinked account) come back to the Account page.
    onAPIError: { errorURL: "/account" },
    session: {
      expiresIn: 60 * 60 * 24 * 60, // 60 days: a study app should not keep asking students to sign in
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (await config.isLocked(session.userId)) return false;
            return { data: session };
          },
        },
      },
    },
    rateLimit: config.rateLimit ? { enabled: true, storage: config.rateLimit } : { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

import { createContext } from "react";
import type { SaveState } from "../lib/progressSync";

/**
 * - checking: reading the saved session
 * - signed-out: no session; the app shows the sign-in page
 * - loading: signed in, loading the profile and progress
 * - failed: signed in, but the profile or progress couldn't be loaded
 * - signed-in: ready
 */
export type AccountStatus = "checking" | "signed-out" | "loading" | "failed" | "signed-in";

export interface Profile {
  id: string;
  studentId: string;
  fullName: string;
  classGroup: string | null;
  cohort: string | null;
  role: "student" | "admin";
  mustChangePassword: boolean;
  displayName: string | null;
  leaderboardJoined: boolean;
}

export interface AppConfig {
  /** The AI Edge Function is set up (VITE_AI_ENABLED). */
  ai: boolean;
}

export interface AuthResult {
  ok: boolean;
  /** An i18n message key or a plain message. */
  message?: string;
}

export interface AccountContextValue {
  status: AccountStatus;
  config: AppConfig;
  user: Profile | null;
  googleLinked: boolean;
  save: SaveState;
  /** Why the student was signed out (an i18n key), shown on the sign-in page. */
  notice: string | null;
  signIn: (studentId: string, password: string) => Promise<AuthResult>;
  /** Redirects to Google; comes back signed in if that Google account is linked to a student. */
  signInWithGoogle: () => Promise<AuthResult>;
  /** Links Google to the signed-in account (redirects to Google and back to /account). */
  linkGoogle: () => Promise<AuthResult>;
  changePassword: (input: { current?: string; next: string }) => Promise<AuthResult>;
  updateSettings: (input: { displayName?: string; leaderboardJoined?: boolean }) => Promise<AuthResult>;
  signOut: (options?: { clearDevice?: boolean }) => Promise<void>;
  saveNow: () => Promise<void>;
  /** Tries loading the profile and progress again after a failure. */
  retry: () => void;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

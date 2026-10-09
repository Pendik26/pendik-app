import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AccountContext, type AccountContextValue, type AccountStatus, type AuthResult, type Profile } from "./accountContextValue";
import { db, isFirstPassword, newClient, rpc, studentEmail } from "../lib/db/client";
import { clearProgress, loadProgress, pendingSaves, queueSave, refreshProgress, saveNow, subscribeSaveState, type SaveState } from "../lib/progressSync";
import { clearDeviceSettings, PROGRESS_CHANGED_EVENT } from "../lib/storage";
import { clearExamRecords, loadExamRecords, refreshExamRecords } from "../lib/exams";
import { clearBookmarkCache } from "../hooks/useBookmarks";

const PROFILE_COLUMNS =
  "id, student_id, full_name, class_group, cohort, track, role, must_change_password, display_name, leaderboard_joined";

interface ProfileRow {
  id: string;
  student_id: string;
  full_name: string;
  class_group: string | null;
  cohort: string | null;
  track: Profile["track"];
  role: "student" | "admin";
  must_change_password: boolean;
  display_name: string | null;
  leaderboard_joined: boolean;
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  studentId: r.student_id,
  fullName: r.full_name,
  classGroup: r.class_group,
  cohort: r.cohort,
  track: r.track,
  role: r.role,
  mustChangePassword: r.must_change_password,
  displayName: r.display_name,
  leaderboardJoined: r.leaderboard_joined,
});

function authError(error: { message?: string; status?: number; code?: string } | null): string {
  if (!error) return "common.error";
  if (error.status === 429) return "auth.tooMany";
  if (error.code === "user_banned" || /banned/i.test(error.message ?? "")) return "auth.locked";
  if (error.code === "invalid_credentials" || error.status === 400) return "auth.wrong";
  return error.message ?? "common.error";
}

const config = { ai: import.meta.env.VITE_AI_ENABLED === "true" };

export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [status, setStatus] = useState<AccountStatus>("checking");
  const [user, setUser] = useState<Profile | null>(null);
  const [save, setSave] = useState<SaveState>({ phase: "idle", pending: 0 });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => subscribeSaveState(setSave), []);

  useEffect(() => {
    void db.auth.getSession().then(({ data }) => { setSession(data.session); });
    const { data } = db.auth.onAuthStateChange((_event, s) => { setSession(s); });
    return () => { data.subscription.unsubscribe(); };
  }, []);

  // Signed in: load the profile, the progress and the exam records together. Only roster students
  // have a profile; a Google account that isn't linked to one gets signed out with an explanation
  // (row level security gives it no progress or attempts, and what loaded is cleared).
  const uid = session?.user.id;
  useEffect(() => {
    if (session === undefined) return;
    if (!uid) {
      loadedFor.current = null;
      return;
    }
    if (loadedFor.current === `${uid}#${attempt}`) return;
    loadedFor.current = `${uid}#${attempt}`;
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      const [profile, rest] = await Promise.all([
        db.from("profiles").select(PROFILE_COLUMNS).eq("id", uid).maybeSingle(),
        Promise.all([loadProgress(uid), loadExamRecords()]).then(() => null, (e: unknown) => e ?? "failed"),
      ]);
      if (cancelled) return;
      if (profile.error) { setStatus("failed"); return; }
      if (!profile.data) {
        clearProgress();
        clearExamRecords();
        setNotice("auth.notOnRoster");
        await db.auth.signOut();
        return;
      }
      if (rest !== null) { setStatus("failed"); return; }
      setNotice(null);
      setUser(toProfile(profile.data as ProfileRow));
      setStatus("signed-in");
    })();
    return () => { cancelled = true; };
  }, [session, uid, attempt]);

  // While signed in: save changes shortly after they're made, before the tab is hidden, and
  // when the connection returns; read the account again when the tab comes back into view.
  useEffect(() => {
    if (status !== "signed-in") return;
    const onChanged = (e: Event) => { queueSave((e as CustomEvent<{ key: string }>).detail.key); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void saveNow();
      else {
        void refreshProgress();
        void refreshExamRecords().catch(() => undefined);
      }
    };
    const onOnline = () => { if (pendingSaves() > 0) void saveNow(); };
    // Leaving with unsaved progress: ask the browser to wait.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingSaves() > 0) { void saveNow(); e.preventDefault(); }
    };
    window.addEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [status]);

  const googleLinked = Boolean(session?.user.identities?.some((i) => i.provider === "google"));

  // What the settings functions just changed, applied here instead of reading the profile again.
  const patchUser = useCallback((patch: Partial<Profile>) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const actions = useMemo(
    () => ({
      signIn: async (studentId: string, password: string): Promise<AuthResult> => {
        const { error } = await db.auth.signInWithPassword({ email: studentEmail(studentId), password });
        return error ? { ok: false, message: authError(error) } : { ok: true };
      },
      signInWithGoogle: async (): Promise<AuthResult> => {
        const { error } = await db.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/` },
        });
        return error ? { ok: false, message: error.message } : { ok: true };
      },
      linkGoogle: async (): Promise<AuthResult> => {
        const { error } = await db.auth.linkIdentity({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/account` },
        });
        return error ? { ok: false, message: error.message } : { ok: true };
      },
      changePassword: async ({ current, next }: { current?: string; next: string }): Promise<AuthResult> => {
        if (next.length < 8) return { ok: false, message: "password.tooShort" };
        const studentId = user?.studentId ?? "";
        if (isFirstPassword(studentId, next)) return { ok: false, message: "password.notFirst" };
        if (current !== undefined) {
          // Check the current password on a separate client, so the session here isn't replaced.
          const checker = newClient({ persistSession: false, autoRefreshToken: false, storageKey: "pendik-password-check" });
          const { error } = await checker.auth.signInWithPassword({ email: studentEmail(studentId), password: current });
          if (error) return { ok: false, message: "password.wrongCurrent" };
          await checker.auth.signOut({ scope: "local" });
        }
        const { error } = await db.auth.updateUser({ password: next });
        if (error) return { ok: false, message: error.message };
        const changed = await rpc("password_changed");
        if (!changed.error) patchUser({ mustChangePassword: false });
        return { ok: true };
      },
      updateSettings: async (input: { displayName?: string; leaderboardJoined?: boolean }): Promise<AuthResult> => {
        const { error } = await rpc("update_my_settings", {
          p_display_name: input.displayName ?? null,
          p_leaderboard_joined: input.leaderboardJoined ?? null,
        });
        if (error) return { ok: false, message: error.message };
        // As update_my_settings() saves them: a blank name keeps the old one.
        const name = input.displayName?.trim();
        patchUser({
          ...(name ? { displayName: name } : {}),
          ...(input.leaderboardJoined !== undefined ? { leaderboardJoined: input.leaderboardJoined } : {}),
        });
        return { ok: true };
      },
      signOut: async ({ clearDevice = false }: { clearDevice?: boolean } = {}) => {
        if (pendingSaves() > 0) await saveNow();
        await db.auth.signOut();
        clearProgress();
        clearExamRecords();
        clearBookmarkCache();
        if (clearDevice) clearDeviceSettings();
      },
      saveNow,
      retry: () => { setAttempt((a) => a + 1); },
    }),
    [user?.studentId, patchUser],
  );

  // Without a session nothing loaded earlier counts, whatever the state still holds.
  const current: AccountStatus = session === undefined ? "checking" : uid ? status : "signed-out";
  const currentUser = uid && user?.id === uid ? user : null;

  const value = useMemo<AccountContextValue>(
    () => ({ status: current, config, user: currentUser, googleLinked, save, notice, ...actions }),
    [current, currentUser, googleLinked, save, notice, actions],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AccountContext, type AccountContextValue, type AccountStatus, type AuthResult, type Profile } from "./accountContextValue";
import { isFirstPassword, studentEmail, supabase } from "../lib/supabase";
import { clearProgress, loadProgress, pendingSaves, queueSave, refreshProgress, saveNow, subscribeSaveState, type SaveState } from "../lib/progressSync";
import { clearDeviceSettings, PROGRESS_CHANGED_EVENT } from "../lib/storage";

const PROFILE_COLUMNS =
  "id, student_id, full_name, class_group, cohort, role, must_change_password, display_name, leaderboard_joined";

interface ProfileRow {
  id: string;
  student_id: string;
  full_name: string;
  class_group: string | null;
  cohort: string | null;
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
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); });
    return () => { data.subscription.unsubscribe(); };
  }, []);

  // Signed in: load the profile, then the progress. Only roster students have a profile; a
  // Google account that isn't linked to one gets signed out with an explanation.
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
      const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", uid).maybeSingle();
      if (cancelled) return;
      if (error) { setStatus("failed"); return; }
      if (!data) {
        setNotice("auth.notOnRoster");
        await supabase.auth.signOut();
        return;
      }
      try {
        await loadProgress(uid);
      } catch {
        if (!cancelled) setStatus("failed");
        return;
      }
      if (cancelled) return;
      setNotice(null);
      setUser(toProfile(data as ProfileRow));
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
      else void refreshProgress();
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

  const reloadProfile = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", uid).maybeSingle();
    if (data) setUser(toProfile(data as ProfileRow));
  }, [uid]);

  const actions = useMemo(
    () => ({
      signIn: async (studentId: string, password: string): Promise<AuthResult> => {
        const { error } = await supabase.auth.signInWithPassword({ email: studentEmail(studentId), password });
        return error ? { ok: false, message: authError(error) } : { ok: true };
      },
      signInWithGoogle: async (): Promise<AuthResult> => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/` },
        });
        return error ? { ok: false, message: error.message } : { ok: true };
      },
      linkGoogle: async (): Promise<AuthResult> => {
        const { error } = await supabase.auth.linkIdentity({
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
          const { createClient } = await import("@supabase/supabase-js");
          const checker = createClient(
            import.meta.env.VITE_SUPABASE_URL as string,
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            { auth: { persistSession: false, autoRefreshToken: false, storageKey: "pendik-password-check" } },
          );
          const { error } = await checker.auth.signInWithPassword({ email: studentEmail(studentId), password: current });
          if (error) return { ok: false, message: "password.wrongCurrent" };
          await checker.auth.signOut({ scope: "local" });
        }
        const { error } = await supabase.auth.updateUser({ password: next });
        if (error) return { ok: false, message: error.message };
        await supabase.rpc("password_changed");
        await reloadProfile();
        return { ok: true };
      },
      updateSettings: async (input: { displayName?: string; leaderboardJoined?: boolean }): Promise<AuthResult> => {
        const { error } = await supabase.rpc("update_my_settings", {
          p_display_name: input.displayName ?? null,
          p_leaderboard_joined: input.leaderboardJoined ?? null,
        });
        if (error) return { ok: false, message: error.message };
        await reloadProfile();
        return { ok: true };
      },
      signOut: async ({ clearDevice = false }: { clearDevice?: boolean } = {}) => {
        if (pendingSaves() > 0) await saveNow();
        await supabase.auth.signOut();
        clearProgress();
        if (clearDevice) clearDeviceSettings();
      },
      saveNow,
      retry: () => { setAttempt((a) => a + 1); },
    }),
    [user?.studentId, reloadProfile],
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

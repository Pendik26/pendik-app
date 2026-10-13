import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccountContext, type AccountContextValue, type AccountStatus, type AuthResult, type Profile } from "./accountContextValue";
import { authClient, rpc } from "../lib/db/client";
import { firstPassword, isFirstPassword, studentEmail } from "../lib/account";
import { clearProgress, loadProgress, pendingSaves, queueSave, refreshProgress, saveNow, subscribeSaveState, type SaveState } from "../lib/progressSync";
import { clearDeviceSettings, PROGRESS_CHANGED_EVENT } from "../lib/storage";
import { clearExamRecords, loadExamRecords, refreshExamRecords } from "../lib/exams";
import { clearBookmarkCache } from "../hooks/useBookmarks";
import { sendRecords, startRecords, stopRecords } from "../lib/studyRecords";

interface ProfileRow {
  id: string;
  student_id: string;
  full_name: string;
  class_group: string | null;
  cohort: string | null;
  track: Profile["track"];
  role: "student" | "admin";
  must_change_password: boolean;
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
  leaderboardJoined: r.leaderboard_joined,
});

function authError(error: { message?: string; status?: number; code?: string } | null): string {
  if (!error) return "common.error";
  if (error.status === 429) return "auth.tooMany";
  // A locked account can't start a session.
  if (error.code === "FAILED_TO_CREATE_SESSION") return "auth.locked";
  if (error.status === 401 || error.status === 400) return "auth.wrong";
  return error.message ?? "common.error";
}

const config = { ai: import.meta.env.VITE_AI_ENABLED === "true" };

export function AccountProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [googleLinked, setGoogleLinked] = useState(false);
  const [status, setStatus] = useState<AccountStatus>("checking");
  const [user, setUser] = useState<Profile | null>(null);
  const [save, setSave] = useState<SaveState>({ phase: "idle", pending: 0 });
  const [attempt, setAttempt] = useState(0);
  // Google sends an account that isn't linked to a student back with ?error=...
  const [notice, setNotice] = useState<string | null>(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error")) return null;
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
    return "auth.notOnRoster";
  });
  const loadedFor = useRef<string | null>(null);

  useEffect(() => subscribeSaveState(setSave), []);

  // Signed in: load the account, the progress and the exam records together. Only roster students
  // have an account; a Google account that isn't linked to one gets signed out with an explanation
  // (the server gives it no progress or attempts, and what loaded is cleared).
  const uid = session?.user.id;
  const checking = isPending && !session;
  useEffect(() => {
    if (checking) return;
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
        rpc<ProfileRow>("my_account"),
        Promise.all([loadProgress(uid), loadExamRecords()]).then(() => null, (e: unknown) => e ?? "failed"),
      ]);
      if (cancelled) return;
      if (profile.error && profile.error.status !== 403 && profile.error.status !== 401) { setStatus("failed"); return; }
      if (!profile.data) {
        clearProgress();
        clearExamRecords();
        setNotice(profile.error?.message === "locked" ? "auth.locked" : "auth.notOnRoster");
        await authClient.signOut();
        return;
      }
      if (rest !== null) { setStatus("failed"); return; }
      setNotice(null);
      startRecords(uid);
      setUser(toProfile(profile.data as ProfileRow));
      setStatus("signed-in");
    })();
    return () => { cancelled = true; };
  }, [checking, uid, attempt]);

  // While signed in: save changes shortly after they're made, before the tab is hidden, and
  // when the connection returns; read the account again when the tab comes back into view.
  useEffect(() => {
    if (status !== "signed-in") return;
    const onChanged = (e: Event) => { queueSave((e as CustomEvent<{ key: string }>).detail.key); };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void saveNow();
        void sendRecords();
      }
      else {
        void refreshProgress();
        void refreshExamRecords().catch(() => undefined);
      }
    };
    const onOnline = () => {
      if (pendingSaves() > 0) void saveNow();
      void sendRecords();
    };
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

  useEffect(() => {
    if (status !== "signed-in") return;
    void authClient.listAccounts().then(({ data }) => { setGoogleLinked(Boolean(data?.some((a) => a.providerId === "google"))); });
  }, [status, uid]);

  // What the settings functions just changed, applied here instead of reading the profile again.
  const patchUser = useCallback((patch: Partial<Profile>) => {
    setUser((u) => (u ? { ...u, ...patch } : u));
  }, []);

  const actions = useMemo(
    () => ({
      signIn: async (studentId: string, password: string): Promise<AuthResult> => {
        const { error } = await authClient.signIn.email({ email: studentEmail(studentId), password });
        return error ? { ok: false, message: authError(error) } : { ok: true };
      },
      signInWithGoogle: async (): Promise<AuthResult> => {
        const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/?error=google" });
        return error ? { ok: false, message: error.message ?? "common.error" } : { ok: true };
      },
      linkGoogle: async (): Promise<AuthResult> => {
        const { error } = await authClient.linkSocial({ provider: "google", callbackURL: "/account" });
        return error ? { ok: false, message: error.message ?? "common.error" } : { ok: true };
      },
      changePassword: async ({ current, next }: { current?: string; next: string }): Promise<AuthResult> => {
        if (next.length < 8) return { ok: false, message: "password.tooShort" };
        const studentId = user?.studentId ?? "";
        if (isFirstPassword(studentId, next)) return { ok: false, message: "password.notFirst" };
        // The forced first change starts from the first password, which the student never typed.
        const { error } = await authClient.changePassword({ currentPassword: current ?? firstPassword(studentId), newPassword: next });
        if (error) return { ok: false, message: current !== undefined && error.status === 400 ? "password.wrongCurrent" : (error.message ?? "common.error") };
        const changed = await rpc("password_changed");
        if (!changed.error) patchUser({ mustChangePassword: false });
        return { ok: true };
      },
      updateSettings: async (input: { leaderboardJoined?: boolean }): Promise<AuthResult> => {
        const { error } = await rpc("update_my_settings", {
          p_leaderboard_joined: input.leaderboardJoined ?? null,
        });
        if (error) return { ok: false, message: error.message };
        patchUser({
          ...(input.leaderboardJoined !== undefined ? { leaderboardJoined: input.leaderboardJoined } : {}),
        });
        return { ok: true };
      },
      signOut: async ({ clearDevice = false }: { clearDevice?: boolean } = {}) => {
        if (pendingSaves() > 0) await saveNow();
        await sendRecords();
        stopRecords({ forget: clearDevice });
        await authClient.signOut();
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
  const current: AccountStatus = checking ? "checking" : uid ? status : "signed-out";
  const currentUser = uid && user?.id === uid ? user : null;

  const value = useMemo<AccountContextValue>(
    () => ({ status: current, config, user: currentUser, googleLinked, save, notice, ...actions }),
    [current, currentUser, googleLinked, save, notice, actions],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

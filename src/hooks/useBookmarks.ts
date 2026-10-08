import { useCallback, useEffect, useState } from "react";
import { useAccount } from "./useAccount";
import { bookmarkedIds, setBookmark } from "../lib/exams";

// The ids are read once per visit and shared by every button on the page.
let ids: Set<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

/** The student's bookmarked question ids, and a toggle that saves at once (and undoes on failure). */
export function useBookmarks(): { has: (id: string) => boolean; toggle: (id: string) => void; problem: string | null } {
  const { user } = useAccount();
  const [, rerender] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const update = () => { rerender((n) => n + 1); };
    listeners.add(update);
    loading ??= bookmarkedIds().then(
      (set) => { ids = set; notify(); },
      () => { loading = null; },
    );
    return () => { listeners.delete(update); };
  }, []);

  const toggle = useCallback((id: string) => {
    if (!user) return;
    const set = ids ??= new Set();
    const on = !set.has(id);
    if (on) set.add(id);
    else set.delete(id);
    notify();
    setProblem(null);
    setBookmark(id, on, user.id).catch((e: Error) => {
      if (on) set.delete(id);
      else set.add(id);
      notify();
      setProblem(e.message);
    });
  }, [user]);

  return { has: (id) => ids?.has(id) ?? false, toggle, problem };
}

/** Forgets the loaded ids (at sign-out). */
export function clearBookmarkCache(): void {
  ids = null;
  loading = null;
}

// The browser's side of the AI answers ("Explain this" and Alfond, the `ai` Edge Function):
// posts a request with the student's session and reads the answer as it streams in as plain text.

import { currentSession, fetchFunction } from "./db/client";
import { currentT as t } from "../i18n/i18n";

export type AiResult = { ok: true; remaining: number | null } | { ok: false; status: number; message: string; partial?: string };

/** The server ends an answer that broke off partway with a NUL character. */
const CUT_OFF = "\u0000";

/** Posts `body` to the AI function, calling onText with the whole answer so far as it arrives. */
export async function streamAi(kind: "explain" | "chat", body: unknown, onText: (text: string) => void, signal?: AbortSignal): Promise<AiResult> {
  const session = await currentSession();
  if (!session) return { ok: false, status: 401, message: t("ai.signIn") };
  let res: Response;
  try {
    res = await fetchFunction(`ai/${kind}`, session, { body: JSON.stringify(body), signal });
  } catch {
    if (signal?.aborted) return { ok: false, status: 0, message: "" };
    return { ok: false, status: 0, message: t("ai.unreachable") };
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, status: res.status, message: data?.error ?? t("ai.cantAnswer") };
  }
  const remaining = res.headers.get("x-ai-remaining");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let cutOff = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.includes(CUT_OFF)) {
        text = text.slice(0, text.indexOf(CUT_OFF));
        cutOff = true;
        break;
      }
      onText(text);
    }
  } catch {
    if (signal?.aborted) return { ok: false, status: 0, message: "", partial: text || undefined };
    cutOff = true;
  }
  if (cutOff) return { ok: false, status: 0, message: t("ai.cutOff"), partial: text || undefined };
  if (!text.trim()) return { ok: false, status: 502, message: t("ai.empty") };
  return { ok: true, remaining: remaining === null ? null : Number(remaining) };
}

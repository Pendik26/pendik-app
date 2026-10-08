// The browser's side of the server's AI answers ("Explain this" and Alfond): posts a request
// and reads the answer as it streams in as plain text.

export type AiResult = { ok: true; remaining: number | null } | { ok: false; status: number; message: string; partial?: string };

/** The server ends an answer that broke off partway with a NUL character. */
const CUT_OFF = "\u0000";

/** Posts `body` to an AI route, calling onText with the whole answer so far as it arrives. */
export async function streamAi(path: string, body: unknown, onText: (text: string) => void, signal?: AbortSignal): Promise<AiResult> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal?.aborted) return { ok: false, status: 0, message: "" };
    return { ok: false, status: 0, message: "Couldn't reach the server. Check your connection." };
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, status: res.status, message: data?.error ?? "The AI couldn't answer right now." };
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
  if (cutOff) return { ok: false, status: 0, message: "The AI stopped partway through. Try again.", partial: text || undefined };
  if (!text.trim()) return { ok: false, status: 502, message: "The AI sent an empty answer. Try again." };
  return { ok: true, remaining: remaining === null ? null : Number(remaining) };
}

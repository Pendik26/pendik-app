// An access token for a Google service account (the JSON key Google gives you), made with Web
// Crypto so it runs in Deno and Node alike. Import-free.

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encodeJson = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** Reads the key from the secret; null when it isn't a service account key. */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const key = JSON.parse(raw) as Partial<ServiceAccount>;
    return key.client_email && key.private_key ? { client_email: key.client_email, private_key: key.private_key, token_uri: key.token_uri } : null;
  } catch {
    return null;
  }
}

async function signingKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

/** A signed JWT asking for `scope`, valid for an hour from `now` (seconds). */
export async function serviceAccountJwt(account: ServiceAccount, scope: string, now: number): Promise<string> {
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const claims = encodeJson({
    iss: account.client_email,
    scope,
    aud: account.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(account.private_key), new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

/** Trades the signed JWT for an access token. */
export async function serviceAccountToken(account: ServiceAccount, scope: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const assertion = await serviceAccountJwt(account, scope, Math.floor(Date.now() / 1000));
  const res = await fetchImpl(account.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google sign-in failed: ${data.error_description ?? data.error ?? res.status}`);
  return data.access_token;
}

import { describe, expect, it } from "vitest";
import { isSecretKey, supabaseEnv } from "./supabaseEnv";

const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, "")}.y`;

describe("supabaseEnv", () => {
  it("reads the app's own names first", () => {
    expect(supabaseEnv({
      VITE_SUPABASE_URL: "https://a.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://b.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_a", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    })).toEqual({ url: "https://a.supabase.co", key: "sb_publishable_a" });
  });

  it("falls back to the Vercel integration's names", () => {
    expect(supabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://b.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_b" }))
      .toEqual({ url: "https://b.supabase.co", key: "sb_publishable_b" });
    expect(supabaseEnv({ SUPABASE_URL: "https://c.supabase.co", SUPABASE_ANON_KEY: jwt("anon") }).key).toBe(jwt("anon"));
  });

  it("never picks the secret keys, and refuses one given as the public key", () => {
    expect(supabaseEnv({ SUPABASE_SECRET_KEY: "sb_secret_x", SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") }).key).toBe("");
    expect(() => supabaseEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" })).toThrow();
    expect(() => supabaseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role") })).toThrow();
  });

  it("tells secret keys apart", () => {
    expect(isSecretKey(jwt("anon"))).toBe(false);
    expect(isSecretKey("sb_publishable_x")).toBe(false);
  });
});

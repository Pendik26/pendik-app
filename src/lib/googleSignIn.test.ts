import { describe, expect, it } from "vitest";
import { googleErrorMessage, isInAppBrowser } from "./googleSignIn";

describe("googleErrorMessage", () => {
  it("explains how to join a Google login to an existing password account", () => {
    expect(googleErrorMessage("account_not_linked")).toMatch(/Connect Google/);
    expect(googleErrorMessage("access_denied")).toMatch(/cancelled/);
    expect(googleErrorMessage("something_new")).toMatch(/didn't work/);
  });
});

describe("isInAppBrowser", () => {
  it("spots app browsers that Google blocks, and not real browsers", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 Line/13.1.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14; SM-A146P; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});

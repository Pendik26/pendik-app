// Helpers for Google sign-in on the Account page.

/** A plain-language message for the ?error= code Google sign-in comes back with. */
export function googleErrorMessage(code: string): string {
  switch (code) {
    case "account_not_linked":
      return "This email already has an account with a password. Sign in with your password, then use “Connect Google” on this page.";
    case "access_denied":
      return "Google sign-in was cancelled.";
    case "email_does_not_match":
      return "That Google account uses a different email from this account. Choose the Google account with the same email.";
    case "account_already_linked_to_different_user":
      return "That Google account is already connected to a different account here.";
    case "state_not_found":
    case "state_mismatch":
    case "please_restart_the_process":
      return "Google sign-in has to finish in the browser it started in. Try again from this page.";
    default:
      return "Google sign-in didn't work. Try again, or use email and password.";
  }
}

/**
 * Whether this looks like an app's built-in browser (Instagram, Facebook, LINE, TikTok, an
 * Android WebView...). Google refuses sign-in inside these ("disallowed_useragent"), so the page
 * suggests opening the link in a real browser instead.
 */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|Snapchat|; wv\)/i.test(userAgent);
}

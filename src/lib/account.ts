// Sign-in names, shared by the app and the server's tests.

/** Students sign in with their student id (NIM); Better Auth sees it as this address. */
export function studentEmail(studentId: string): string {
  return `${studentId.trim().toLowerCase()}@pendik26.internal`;
}

/** A first password is `pendik26` + the student id; it can't be kept as the new password. */
export function isFirstPassword(studentId: string, password: string): boolean {
  return password === firstPassword(studentId);
}

/** The password every new account starts with. */
export function firstPassword(studentId: string): string {
  return `pendik26${studentId.trim()}`;
}

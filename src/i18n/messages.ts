// Every interface message, in English and Indonesian. English is the reference: `id` must have
// exactly the same keys (i18n.test.ts checks), and the same {placeholders}. Larger areas keep
// theirs in sections/ and are merged here.

import { adminEn, adminId } from "./sections/admin";
import { driveEn, driveId } from "./sections/drive";
import { examEn, examId } from "./sections/exam";
import { homeEn, homeId } from "./sections/home";
import { planEn, planId } from "./sections/plan";
import { navEn, navId } from "./sections/nav";

const coreEn = {
  // Shared
  "common.loading": "Loading…",
  "common.retry": "Try again",
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.back": "Back",
  "common.yes": "Yes",
  "common.no": "No",
  "common.offline": "You're offline.",
  "common.error": "Something went wrong: {message}",

  // Signing in
  "auth.title": "Sign in",
  "auth.subtitle": "For students on the class roster. Use your student id (NIM) and password.",
  "auth.studentId": "Student id (NIM)",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
  "auth.or": "or",
  "auth.google": "Continue with Google",
  "auth.googleHint": "Google works after you've linked it from your Account page.",
  "auth.firstTime": "First time? Your password is pendik26 followed by your NIM. You'll choose a new one right after.",
  "auth.wrong": "Wrong student id or password.",
  "auth.locked": "This account is locked. Ask an admin.",
  "auth.tooMany": "Too many attempts. Wait a minute and try again.",
  "auth.notOnRoster": "This Google account isn't linked to a student. Sign in with your NIM first, then link Google from your Account page.",
  "auth.profileFailed": "Your account couldn't be loaded.",
  "auth.progressFailed": "Your progress couldn't be loaded. Check your connection.",
  "auth.signOut": "Sign out",
  "auth.hello": "Hi, {name}",
  "auth.notConfigured": "The app isn't connected to its database yet.",

  // First-login password change
  "password.title": "Choose a new password",
  "password.subtitle": "You're signed in with your first password. Choose your own before you continue.",
  "password.new": "New password",
  "password.confirm": "Repeat the new password",
  "password.current": "Current password",
  "password.save": "Save password",
  "password.tooShort": "Use at least 8 characters.",
  "password.mismatch": "The two passwords don't match.",
  "password.notFirst": "Choose something other than your first password.",
  "password.wrongCurrent": "Your current password isn't right.",
  "password.done": "Password changed.",

  // Saving progress
  "save.saved": "All progress saved",
  "save.saving": "Saving…",
  "save.pending": "{count} change(s) waiting to be saved",
  "save.failed": "Couldn't save: {message}",
  "save.now": "Save now",

  // Account page
  "account.title": "Account",
  "account.profile": "Profile",
  "account.name": "Name",
  "account.studentId": "Student id",
  "account.class": "Class",
  "account.cohort": "Cohort",
  "account.role": "Role",
  "account.roleAdmin": "Admin",
  "account.roleStudent": "Student",
  "account.displayName": "Name on the leaderboard",
  "account.displayNameHint": "2 to 32 characters. Your real name is never shown to other students.",
  "account.currentBlock": "Your current block",
  "account.saved": "Saved.",
  "account.signInMethods": "Sign-in",
  "account.googleLinked": "Google is linked. You can sign in with it.",
  "account.googleNotLinked": "Link Google to sign in with one tap next time.",
  "account.linkGoogle": "Link Google",
  "account.changePassword": "Change password",
  "account.appearance": "Appearance",
  "account.language": "Language",
  "account.languageId": "Bahasa Indonesia",
  "account.languageEn": "English",
  "account.theme": "Theme",
  "account.themeLight": "Light",
  "account.themeDark": "Dark",
  "account.data": "Your data",
  "account.download": "Download my data",
  "account.downloadHint": "Everything saved in your account, as a JSON file.",
  "account.signOutClear": "Sign out and clear this device",

} as const;

const coreId: { [K in keyof typeof coreEn]: string } = {
  "common.loading": "Memuat…",
  "common.retry": "Coba lagi",
  "common.save": "Simpan",
  "common.saving": "Menyimpan…",
  "common.cancel": "Batal",
  "common.close": "Tutup",
  "common.back": "Kembali",
  "common.yes": "Ya",
  "common.no": "Tidak",
  "common.offline": "Kamu sedang offline.",
  "common.error": "Ada yang salah: {message}",

  "auth.title": "Masuk",
  "auth.subtitle": "Untuk mahasiswa yang terdaftar di kelas. Gunakan NIM dan password kamu.",
  "auth.studentId": "NIM",
  "auth.password": "Password",
  "auth.signIn": "Masuk",
  "auth.signingIn": "Sedang masuk…",
  "auth.or": "atau",
  "auth.google": "Lanjutkan dengan Google",
  "auth.googleHint": "Google bisa dipakai setelah kamu menautkannya dari halaman Akun.",
  "auth.firstTime": "Pertama kali? Password kamu pendik26 diikuti NIM. Setelah masuk kamu akan diminta membuat password baru.",
  "auth.wrong": "NIM atau password salah.",
  "auth.locked": "Akun ini dikunci. Hubungi admin.",
  "auth.tooMany": "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
  "auth.notOnRoster": "Akun Google ini belum ditautkan ke mahasiswa. Masuk dengan NIM dulu, lalu tautkan Google dari halaman Akun.",
  "auth.profileFailed": "Akun kamu tidak bisa dimuat.",
  "auth.progressFailed": "Progres kamu tidak bisa dimuat. Periksa koneksi internet.",
  "auth.signOut": "Keluar",
  "auth.hello": "Halo, {name}",
  "auth.notConfigured": "Aplikasi belum terhubung ke database.",

  "password.title": "Buat password baru",
  "password.subtitle": "Kamu masuk dengan password awal. Buat password sendiri sebelum lanjut.",
  "password.new": "Password baru",
  "password.confirm": "Ulangi password baru",
  "password.current": "Password sekarang",
  "password.save": "Simpan password",
  "password.tooShort": "Minimal 8 karakter.",
  "password.mismatch": "Kedua password tidak sama.",
  "password.notFirst": "Jangan pakai password awal.",
  "password.wrongCurrent": "Password sekarang salah.",
  "password.done": "Password sudah diganti.",

  "save.saved": "Semua progres tersimpan",
  "save.saving": "Menyimpan…",
  "save.pending": "{count} perubahan menunggu disimpan",
  "save.failed": "Gagal menyimpan: {message}",
  "save.now": "Simpan sekarang",

  "account.title": "Akun",
  "account.profile": "Profil",
  "account.name": "Nama",
  "account.studentId": "NIM",
  "account.class": "Kelas",
  "account.cohort": "Angkatan",
  "account.role": "Peran",
  "account.roleAdmin": "Admin",
  "account.roleStudent": "Mahasiswa",
  "account.displayName": "Nama di papan peringkat",
  "account.displayNameHint": "2 sampai 32 karakter. Nama asli kamu tidak pernah ditampilkan ke mahasiswa lain.",
  "account.currentBlock": "Blok kamu sekarang",
  "account.saved": "Tersimpan.",
  "account.signInMethods": "Cara masuk",
  "account.googleLinked": "Google sudah ditautkan. Kamu bisa masuk dengannya.",
  "account.googleNotLinked": "Tautkan Google supaya lain kali bisa masuk dengan sekali ketuk.",
  "account.linkGoogle": "Tautkan Google",
  "account.changePassword": "Ganti password",
  "account.appearance": "Tampilan",
  "account.language": "Bahasa",
  "account.languageId": "Bahasa Indonesia",
  "account.languageEn": "English",
  "account.theme": "Tema",
  "account.themeLight": "Terang",
  "account.themeDark": "Gelap",
  "account.data": "Data kamu",
  "account.download": "Unduh data saya",
  "account.downloadHint": "Semua yang tersimpan di akun kamu, sebagai file JSON.",
  "account.signOutClear": "Keluar dan bersihkan perangkat ini",

};

export const en = { ...coreEn, ...navEn, ...homeEn, ...planEn, ...examEn, ...adminEn, ...driveEn };

export type Messages = { [K in keyof typeof en]: string };

export const id: Messages = { ...coreId, ...navId, ...homeId, ...planId, ...examId, ...adminId, ...driveId };

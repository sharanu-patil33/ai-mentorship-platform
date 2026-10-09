import { supabase } from "@/integrations/supabase/client";

/** Where the student/mentor platform (login owner) runs. Set VITE_PLATFORM_URL in .env */
export const PLATFORM_URL: string =
  (import.meta.env["VITE_PLATFORM_URL"] as string | undefined) ?? "http://localhost:3000";

const RETURN_KEY = "meetspace.return-url";
const LOGIN_KEY = "meetspace.login-page";
const SSO_ERROR_KEY = "meetspace.sso-error";
const LAST_UID_KEY = "meetspace.last-uid";

// Browser data that belongs to ONE person and must never be shown to the next one.
const MEMORY_MEETINGS_KEY = "meetspace_memory_meetings_v2";
const PER_USER_SESSION_KEYS = ["meetspace.display-name", "meetspace_pre_call_route"];

function wipeUserState(): void {
  window.localStorage.removeItem(MEMORY_MEETINGS_KEY);
  PER_USER_SESSION_KEYS.forEach((k) => window.sessionStorage.removeItem(k));
}

/** Signs out of MeetSpace on THIS browser only (does not revoke the platform's login). */
async function dropCurrentSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* nothing to drop */
  }
}

function fail(message: string): void {
  window.sessionStorage.setItem(SSO_ERROR_KEY, message);
}

async function doConsume(): Promise<void> {
  if (typeof window === "undefined") return;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return;

  const params = new URLSearchParams(hash);
  const clean = () =>
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

  // Platform logout: forget whoever is signed in to MeetSpace on this browser.
  if (params.get("logout") === "1") {
    clean();
    await dropCurrentSession();
    wipeUserState();
    window.localStorage.removeItem(LAST_UID_KEY);
    window.sessionStorage.removeItem(SSO_ERROR_KEY);
    return;
  }

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return;

  // Which platform login page to use if the session is ever missing (students vs mentors)
  const login = params.get("login");
  if (login === "auth.html" || login === "mentor-auth.html") {
    window.sessionStorage.setItem(LOGIN_KEY, login);
  }
  const back = params.get("return");
  if (back) window.sessionStorage.setItem(RETURN_KEY, back);

  const expectedUid = params.get("uid");

  // Remove tokens from the address bar immediately
  clean();
  window.sessionStorage.removeItem(SSO_ERROR_KEY);

  // Never reuse a previous person's session: clear it FIRST, then sign in as the
  // person who clicked "Open MeetSpace". If anything fails, nobody stays signed in.
  await dropCurrentSession();

  try {
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error || !data.session) {
      fail(error?.message ?? "Could not start your MeetSpace session");
      return;
    }

    const uid = data.session.user.id;
    if (expectedUid && uid !== expectedUid) {
      await dropCurrentSession();
      fail("The signed-in account does not match the dashboard account. Please log in again.");
      return;
    }

    // Different person than last time on this browser: drop the previous person's local data.
    const previous = window.localStorage.getItem(LAST_UID_KEY);
    if (previous && previous !== uid) wipeUserState();
    window.localStorage.setItem(LAST_UID_KEY, uid);
  } catch (e) {
    await dropCurrentSession();
    fail(e instanceof Error ? e.message : "Unknown error");
  }
}

let pending: Promise<void> | null = null;

/** Applies the platform handoff (sign-in or logout) found in the URL hash. Runs once per page load. */
export function consumeSsoHandoff(): Promise<void> {
  if (!pending) pending = doConsume().catch(() => undefined);
  return pending;
}

export function platformLoginUrl(): string {
  const page =
    typeof window !== "undefined" ? window.sessionStorage.getItem(LOGIN_KEY) : null;
  return `${PLATFORM_URL}/${page || "auth.html"}`;
}

/** Where "Back to dashboard" goes: the page the user came from, else the platform login. */
export function platformReturnUrl(): string {
  if (typeof window === "undefined") return platformLoginUrl();
  return window.sessionStorage.getItem(RETURN_KEY) || platformLoginUrl();
}

/** Why the automatic sign-in failed (shown on the /login page), if it did. */
export function ssoErrorMessage(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(SSO_ERROR_KEY);
}
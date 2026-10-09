import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { consumeSsoHandoff } from "@/lib/sso";
import { getProfile } from "@/services/profiles";
import type { Profile } from "@/types";

const SESSION_ONLY_KEY = "meetspace.session-only";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setProfile(null);
      setLoading(false);
    });

    consumeSsoHandoff()
      .then(() => supabase.auth.getSession())
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });

    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    try {
      setProfile(await getProfile(userId));
    } catch {
      setProfile(null);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // "Remember me" opt-out: end the session when the browser tab is closed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      if (window.sessionStorage.getItem(SESSION_ONLY_KEY) === "1") {
        void supabase.auth.signOut();
      }
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      loading,
      refreshProfile: loadProfile,
      signOut,
    }),
    [session, profile, loading, loadProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function setSessionOnly(sessionOnly: boolean) {
  if (typeof window === "undefined") return;
  if (sessionOnly) window.sessionStorage.setItem(SESSION_ONLY_KEY, "1");
  else window.sessionStorage.removeItem(SESSION_ONLY_KEY);
}
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import * as api from "../api/client";
import { identifyRevenueCatUser, resetRevenueCatUser } from "../billing/revenueCat";
import type { PremiumStatus, User } from "../types";

type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: User | null;
  premium: PremiumStatus | null;
  refreshPremium: () => Promise<PremiumStatus>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function safelyIdentifyRevenueCatUser(userId: string) {
  await identifyRevenueCatUser(userId).catch((error) => {
    if (__DEV__) {
      console.log("[RevenueCat] identify failed.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function safelyResetRevenueCatUser() {
  await resetRevenueCatUser().catch((error) => {
    if (__DEV__) {
      console.log("[RevenueCat] reset failed.", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [premium, setPremium] = useState<PremiumStatus | null>(null);

  useEffect(() => {
    api.restoreSession()
      .then((session) => {
        setUser(session?.user ?? null);
        setPremium(session?.premium ?? null);
        setStatus(session?.user ? "authenticated" : "unauthenticated");
        if (session?.user) {
          void safelyIdentifyRevenueCatUser(session.user.id);
        }
      })
      .catch(() => setStatus("unauthenticated"));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    premium,
    async refreshPremium() {
      const status = await api.getPremiumStatus();
      setPremium(status);
      return status;
    },
    async signIn(email, password) {
      const session = await api.login(email, password);
      await safelyIdentifyRevenueCatUser(session.user.id);
      setUser(session.user);
      setPremium(session.premium);
      setStatus("authenticated");
    },
    async signOut() {
      await safelyResetRevenueCatUser();
      await api.logout();
      setUser(null);
      setPremium(null);
      setStatus("unauthenticated");
    },
  }), [premium, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return value;
}

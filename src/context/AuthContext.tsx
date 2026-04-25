import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { bootstrapStaffSession, clearStoredAuth, loginStaff, logoutStaff, subscribeAccessToken } from "../api/client";
import type { StaffRole, StaffSession } from "../types/domain";

type WaiterSession = {
  id: string;
  name: string;
};

type AuthContextValue = {
  loading: boolean;
  role: StaffRole | null;
  session: StaffSession | null;
  waiter: WaiterSession | null;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<StaffSession | null>(null);

  const applyBootstrap = useCallback(async () => {
    const bootstrap = await bootstrapStaffSession();
    setSession(bootstrap?.session ?? null);
  }, []);

  useEffect(() => {
    const restore = async () => {
      try {
        await applyBootstrap();
      } finally {
        setLoading(false);
      }
    };

    void restore();
  }, [applyBootstrap]);

  useEffect(() => {
    return subscribeAccessToken((token) => {
      if (!token) {
        setSession(null);
      }
    });
  }, []);

  const signIn = useCallback(async (login: string, password: string) => {
    const payload = await loginStaff(login, password);
    const bootstrap = await bootstrapStaffSession();

    setSession(
      bootstrap?.session ?? {
        role: payload.role,
        userId: payload.user.id,
        name: payload.user.name,
        sessionId: "pending",
        expiresAt: payload.expiresAt,
      },
    );
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutStaff();
    } finally {
      await clearStoredAuth();
      setSession(null);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    await applyBootstrap();
  }, [applyBootstrap]);

  const waiter = useMemo(() => {
    if (!session || session.role !== "waiter") return null;
    return {
      id: session.userId,
      name: session.name,
    };
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      role: session?.role ?? null,
      session,
      waiter,
      signIn,
      signOut,
      refreshSession,
    }),
    [loading, refreshSession, session, signIn, signOut, waiter],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}

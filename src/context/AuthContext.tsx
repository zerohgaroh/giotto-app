import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchHallData, loginWaiter, logoutWaiter } from "../api/client";

type Role = "waiter" | "manager";

type WaiterSession = {
  id: string;
  name: string;
};

type AuthContextValue = {
  loading: boolean;
  role: Role | null;
  waiter: WaiterSession | null;
  signInWaiter: (login: string, password: string) => Promise<void>;
  signInManager: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const STORAGE_KEY = "giotto.mobile.auth.v1";

const AuthContext = createContext<AuthContextValue | null>(null);

function getManagerLogins() {
  const fromEnv = process.env.EXPO_PUBLIC_MANAGER_LOGIN?.trim().toLowerCase();
  const fromEnvEmail = process.env.EXPO_PUBLIC_MANAGER_EMAIL?.trim().toLowerCase();

  return new Set(
    [fromEnv, fromEnvEmail, "manager", "manager@giotto.local"].filter((item): item is string => !!item),
  );
}

function getManagerPassword() {
  return process.env.EXPO_PUBLIC_MANAGER_PASSWORD || "manager123";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [waiter, setWaiter] = useState<WaiterSession | null>(null);

  useEffect(() => {
    const restore = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { role: Role; waiter?: WaiterSession | null };
        setRole(parsed.role || null);
        setWaiter(parsed.waiter || null);
      } catch {
        // ignore restoration issues
      } finally {
        setLoading(false);
      }
    };

    void restore();
  }, []);

  const persist = useCallback(async (nextRole: Role | null, nextWaiter: WaiterSession | null) => {
    if (!nextRole) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        role: nextRole,
        waiter: nextWaiter,
      }),
    );
  }, []);

  const signInWaiter = useCallback(async (login: string, password: string) => {
    const payload = await loginWaiter(login.trim().toLowerCase(), password);
    const nextWaiter = {
      id: payload.waiter.id,
      name: payload.waiter.name,
    };

    setRole("waiter");
    setWaiter(nextWaiter);
    await persist("waiter", nextWaiter);
  }, [persist]);

  const signInManager = useCallback(async (login: string, password: string) => {
    const normalized = login.trim().toLowerCase();
    const managerLogins = getManagerLogins();
    const managerPassword = getManagerPassword();

    if (!managerLogins.has(normalized) || password !== managerPassword) {
      throw new Error("Неверные данные менеджера");
    }

    // Validate backend availability before opening manager panel.
    await fetchHallData();

    setRole("manager");
    setWaiter(null);
    await persist("manager", null);
  }, [persist]);

  const signOut = useCallback(async () => {
    if (role === "waiter") {
      try {
        await logoutWaiter();
      } catch {
        // ignore temporary network errors on logout
      }
    }

    setRole(null);
    setWaiter(null);
    await persist(null, null);
  }, [persist, role]);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    role,
    waiter,
    signInWaiter,
    signInManager,
    signOut,
  }), [loading, role, signInManager, signInWaiter, signOut, waiter]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}

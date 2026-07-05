import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as authApi from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const u = await authApi.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    setUnauthorizedHandler(() => setUser(null));
  }, [load]);

  const doLogin = async (login, password) => {
    const res = await authApi.login(login, password);
    setUser(res.user);
    return res;
  };
  const doLogout = async () => {
    try { await authApi.logout(); } catch {}
    setUser(null);
  };
  const refreshMe = async () => {
    const u = await authApi.me();
    setUser(u);
    return u;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login: doLogin, logout: doLogout, refreshMe, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth: wrap your app in AuthProvider");
  return ctx;
}

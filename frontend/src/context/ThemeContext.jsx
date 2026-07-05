import { createContext, useEffect } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    try { localStorage.setItem("aerith-theme", "dark"); } catch {}
  }, []);

  const value = { theme: "dark", setTheme: () => {}, toggle: () => {} };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

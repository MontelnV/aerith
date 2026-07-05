import { useEffect, useMemo, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import WorkspaceRail from "./WorkspaceRail";
import { DEFAULT_MODULE_ID, getModule, MODULES } from "../modules/_config";

const MODULE_PATH_RE = new RegExp(
  `^/m/(${MODULES.map((m) => m.id).join("|")})(?:/|$)`,
);
const MODULE_THEME_TRANSITION_MS = 1000;

export default function AppShell() {
  const { pathname } = useLocation();
  const moduleThemeReady = useRef(false);

  const { railActiveId, themeModuleId } = useMemo(() => {
    const m = pathname.match(MODULE_PATH_RE);
    if (m) {
      const id = m[1];
      return { railActiveId: getModule(id) ? id : null, themeModuleId: getModule(id) ? id : DEFAULT_MODULE_ID };
    }
    if (pathname === "/") {
      return { railActiveId: null, themeModuleId: DEFAULT_MODULE_ID };
    }
    return { railActiveId: DEFAULT_MODULE_ID, themeModuleId: DEFAULT_MODULE_ID };
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.module = themeModuleId;
    if (!moduleThemeReady.current) {
      moduleThemeReady.current = true;
      return () => {
        delete root.dataset.module;
      };
    }
    root.classList.add("module-theme-animate");
    const timer = window.setTimeout(
      () => root.classList.remove("module-theme-animate"),
      MODULE_THEME_TRANSITION_MS,
    );
    return () => {
      window.clearTimeout(timer);
      root.classList.remove("module-theme-animate");
      delete root.dataset.module;
    };
  }, [themeModuleId]);

  return (
    <div className="app-shell-root flex h-screen">
      {MODULES.length > 1 ? <WorkspaceRail activeId={railActiveId} /> : null}
      <Outlet />
    </div>
  );
}

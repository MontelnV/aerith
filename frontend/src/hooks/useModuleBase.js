import { useLocation } from "react-router-dom";
import { DEFAULT_MODULE_ID, MODULES } from "../modules/_config";

function resolveModuleFromPath(pathname) {
  const found = MODULES.find(
    (m) => pathname === `/m/${m.id}` || pathname.startsWith(`/m/${m.id}/`),
  );
  return found?.id || DEFAULT_MODULE_ID;
}

export function useModuleBase() {
  const { pathname } = useLocation();
  return `/m/${resolveModuleFromPath(pathname)}`;
}

export function useModuleId() {
  const { pathname } = useLocation();
  return resolveModuleFromPath(pathname);
}

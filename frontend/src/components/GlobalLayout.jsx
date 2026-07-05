import { Outlet } from "react-router-dom";
import { Settings as SettingsIcon, Shield } from "lucide-react";
import ModuleSidebar from "./ModuleSidebar";
import { useAuth } from "../context/AuthContext";

export default function GlobalLayout() {
  const { user } = useAuth();
  const extraNav = [
    { to: "/profile", label: "Settings", icon: SettingsIcon, absolute: true },
  ];
  if (user?.role === "admin") {
    extraNav.push({ to: "/admin", label: "Admin", icon: Shield, absolute: true });
  }
  return (
    <>
      <ModuleSidebar module={null} extraNav={extraNav} />
      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </>
  );
}

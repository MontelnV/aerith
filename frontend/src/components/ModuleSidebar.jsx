import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import Brand from "./Brand";
import { useAuth } from "../context/AuthContext";

function userInitials(user) {
  if (!user) return "?";
  const name = (user.display_name || user.login || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 2).toUpperCase()) || "?";
}

export default function ModuleSidebar({ module, extraNav = [], children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const base = module ? `/m/${module.id}` : "";
  const nav = module?.nav || [];
  const allNav = [...nav, ...extraNav];

  const displayName = user?.display_name?.trim() || user?.login || "";

  const restPath = (() => {
    if (!module) return location.pathname.replace(/^\//, "");
    const prefix = `/m/${module.id}/`;
    if (location.pathname === `/m/${module.id}`) return "";
    if (location.pathname.startsWith(prefix)) return location.pathname.slice(prefix.length);
    return "";
  })();

  return (
    <aside className="app-shell-aside w-60 shrink-0 flex flex-col">
      <div className="p-4 pb-3 flex items-center gap-3 min-w-0">
        <Link to="/" className="block min-w-0">
          <Brand size="md" />
        </Link>
      </div>

      <nav className="flex flex-col gap-1.5 px-3 py-2">
        {allNav.map((item) => {
          const Icon = item.icon;
          const to = item.absolute ? item.to : `${base}/${item.to}`.replace(/\/$/, "");
          const customActive = typeof item.matches === "function" ? item.matches(restPath) : null;
          return (
            <NavLink
              key={to}
              to={to}
              end={!item.matches}
              className={({ isActive }) => {
                const active = customActive ?? isActive;
                return `group relative flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-sm transition-[transform] duration-200 ease-out transition-theme ${
                  active
                    ? "border-[var(--border-subtle)] bg-[var(--bg-raised)]"
                    : "border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-raised)]"
                }`;
              }}
            >
              {({ isActive }) => {
                const active = customActive ?? isActive;
                return (
                  <>
                    <span
                      className={`w-1 shrink-0 self-stretch min-h-[1.5rem] rounded-full transition-theme ${
                        active
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--border-subtle)] opacity-40 group-hover:opacity-70"
                      }`}
                      aria-hidden
                    />
                    <span
                      className="shrink-0 inline-flex items-center justify-center rounded-lg transition-theme"
                      style={{
                        width: 28,
                        height: 28,
                        background: active ? "var(--accent-soft)" : "transparent",
                        color: active ? "var(--accent)" : "var(--text-muted)",
                      }}
                      aria-hidden
                    >
                      <Icon size={15} strokeWidth={1.9} />
                    </span>
                    <span
                      className={`flex-1 truncate leading-snug ${
                        active
                          ? "font-semibold text-[var(--text-primary)]"
                          : "font-medium text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {item.label}
                    </span>
                  </>
                );
              }}
            </NavLink>
          );
        })}
      </nav>

      {children && <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>}
      {!children && <div className="flex-1" />}

      <div ref={menuRef} className="relative shrink-0 p-4">
        {menuOpen && (
          <div
            className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border p-2 flex flex-col gap-0.5 z-50"
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)",
            }}
            role="menu"
          >
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-theme hover:bg-[var(--bg-raised)] ${
                  isActive ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
                }`
              }
              onClick={() => setMenuOpen(false)}
              role="menuitem"
            >
              <SettingsIcon size={16} />
              Settings
            </NavLink>
            <button
              type="button"
              className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm w-full text-left transition-colors hover:bg-[var(--bg-raised)]"
              style={{ color: "var(--danger)" }}
              role="menuitem"
              onClick={async () => {
                setMenuOpen(false);
                await logout();
                navigate("/login");
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        )}
        <button
          type="button"
          className="flex min-h-[2.5rem] w-full min-w-0 items-center gap-3 rounded-xl px-2 text-left transition-theme hover:bg-[var(--bg-raised)]"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Profile menu"
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold transition-theme"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {userInitials(user)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{displayName}</div>
            <div className="truncate text-[11px] text-muted">{user?.login}</div>
          </div>
        </button>
      </div>
    </aside>
  );
}

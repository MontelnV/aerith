import { useState } from "react";
import { Link } from "react-router-dom";
import { MODULES } from "../modules/_config";

const RAIL_INTRO_FLAG = "aerith.analyticsRailIntro";
const RAIL_INTRO_WAS_COLLAPSED = "aerith.analyticsRailIntroWasCollapsed";

export default function WorkspaceRail({ activeId }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <nav
      className={`workspace-rail shrink-0 flex flex-col py-3 gap-1${expanded ? " is-expanded" : ""}`}
      aria-label="Modules"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setExpanded(false);
        }
      }}
    >
      {MODULES.map((m) => {
        const Icon = m.icon;
        const active = activeId === m.id;
        const railName = m.railLabel || m.label;
        const to = `/m/${m.id}`;

        return (
          <Link
            key={m.id}
            to={to}
            title={m.description ? `${railName} — ${m.description}` : railName}
            aria-label={m.label}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (m.id !== "analytics" || active) return;
              try {
                sessionStorage.setItem(RAIL_INTRO_FLAG, "1");
                sessionStorage.setItem(
                  RAIL_INTRO_WAS_COLLAPSED,
                  localStorage.getItem("aerith.railCollapsed") === "1" ? "1" : "0",
                );
              } catch {}
            }}
            className={`workspace-rail__btn group relative flex items-center rounded-xl transition-transform duration-200 ease-out ${
              active ? "is-active" : "hover:bg-[var(--bg-raised)]"
            }`}
            style={{
              color: active ? "var(--btn-primary-text, #fff)" : "var(--text-muted)",
              background: active
                ? "linear-gradient(135deg, var(--btn-primary-grad-a) 0%, var(--btn-primary-grad-b) 55%, var(--btn-primary-grad-c) 100%)"
                : "transparent",
              boxShadow: active
                ? "inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 6px 18px -10px var(--btn-primary-glow)"
                : "none",
            }}
          >
            <span className="workspace-rail__icon shrink-0 flex items-center justify-center">
              <Icon size={18} strokeWidth={1.9} />
            </span>
            <span className="workspace-rail__label">{railName}</span>
          </Link>
        );
      })}
    </nav>
  );
}

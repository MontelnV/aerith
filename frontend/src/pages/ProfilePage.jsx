import { useState } from "react";
import { KeyRound, Palette, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { changePassword } from "../api/auth";
import ProviderSettings from "../components/ProviderSettings";

function initials(user) {
  const source = (user?.display_name || user?.login || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ProfilePage() {
  const { user } = useAuth();
  const memberSince = formatDate(user?.created_at);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-6 flex flex-col gap-5">
        <div className="settings-hero">
          <div className="settings-hero__avatar" aria-hidden>
            {initials(user)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="settings-hero__name">
              {user?.display_name || user?.login}
            </div>
            <div className="settings-hero__meta">
              <span>@{user?.login}</span>
              {memberSince && (
                <>
                  <span className="settings-hero__dot" aria-hidden />
                  <span>since {memberSince}</span>
                </>
              )}
            </div>
          </div>
          {user?.role === "admin" && (
            <span className="settings-hero__badge">
              <ShieldCheck size={12} strokeWidth={2.4} />
              Admin
            </span>
          )}
        </div>

        <ProviderSettings />
        <AppearanceSection />
        <PasswordSection />
      </div>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="settings-card">
      <div className="settings-card__head">
        <div className="settings-card__icon" aria-hidden>
          <Palette size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="settings-card__title">Appearance</h2>
          <p className="settings-card__subtitle">Choose your preferred color theme</p>
        </div>
      </div>
      <div className="theme-picker" role="radiogroup" aria-label="Color theme">
        <button
          type="button"
          role="radio"
          aria-checked={theme === "light"}
          className={`theme-picker__option${theme === "light" ? " is-active" : ""}`}
          onClick={() => setTheme("light")}
        >
          <span className="theme-picker__swatch theme-picker__swatch--light" aria-hidden />
          Light
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={theme === "dark"}
          className={`theme-picker__option${theme === "dark" ? " is-active" : ""}`}
          onClick={() => setTheme("dark")}
        >
          <span className="theme-picker__swatch theme-picker__swatch--dark" aria-hidden />
          Dark
        </button>
      </div>
    </section>
  );
}

function PasswordSection() {
  const { refreshMe } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    if (next !== confirm) {
      setErr("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      await refreshMe();
      setMsg("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
      setOpen(false);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card">
      <div className="settings-card__head">
        <div className="settings-card__icon" aria-hidden>
          <KeyRound size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="settings-card__title">Password</h2>
          <p className="settings-card__subtitle">Change your account password</p>
        </div>
        {!open && (
          <button type="button" className="btn btn-sm" onClick={() => { setOpen(true); setMsg(""); }}>
            Change
          </button>
        )}
      </div>

      {msg && !open && (
        <div className="settings-note settings-note--ok">{msg}</div>
      )}

      {open && (
        <form onSubmit={onSubmit} className="settings-card__body flex flex-col gap-3">
          <div>
            <label className="label">Current password</label>
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">New password</label>
              <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={6} required />
            </div>
            <div>
              <label className="label">Confirm</label>
              <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
            </div>
          </div>
          {err && <div className="settings-note settings-note--err">{err}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn" onClick={() => { setOpen(false); setErr(""); }} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

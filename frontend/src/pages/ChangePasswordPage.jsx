import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Brand from "../components/Brand";
import { changePassword } from "../api/auth";
import { useAuth } from "../context/AuthContext";

export default function ChangePasswordPage() {
  const { user, refreshMe, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      await refreshMe();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="aerith-backdrop" />
      <div className="relative z-10 w-full max-w-sm fade-in">
        <div className="text-center mb-6">
          <Brand size="lg" />
          <div className="text-muted text-sm mt-3">
            {user?.must_change_password ? "Set a new password to continue" : "Change password"}
          </div>
        </div>
        <form onSubmit={onSubmit} className="card flex flex-col gap-3.5">
          <div>
            <label className="label">Current password</label>
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div>
            <label className="label">New password</label>
            <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={6} required />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
          </div>
          {error && <div className="text-sm" style={{ color: "var(--danger)" }}>{error}</div>}
          <button className="btn btn-primary mt-1" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-1"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

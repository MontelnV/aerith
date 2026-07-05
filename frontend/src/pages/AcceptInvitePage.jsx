import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Brand from "../components/Brand";
import { acceptInvite } from "../api/auth";
import { useAuth } from "../context/AuthContext";

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [token, setToken] = useState(params.get("token") || "");
  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await acceptInvite(token.trim(), login.trim(), password, displayName.trim());
      await refreshMe();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Could not activate invitation");
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
          <div className="text-muted text-sm mt-3">Create your account</div>
        </div>
        <form onSubmit={onSubmit} className="card flex flex-col gap-3.5">
          <div>
            <label className="label">Invitation token</label>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
          </div>
          <div>
            <label className="label">Login</label>
            <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} required />
          </div>
          <div>
            <label className="label">Display name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
          </div>
          {error && <div className="text-sm" style={{ color: "var(--danger)" }}>{error}</div>}
          <button className="btn btn-primary mt-1" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
          <div className="text-center text-xs text-muted">
            Already have an account? <Link to="/login" style={{ color: "var(--accent)" }}>Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

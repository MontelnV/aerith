import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../components/Brand";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [loginVal, setLoginVal] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate(user.must_change_password ? "/change-password" : "/", { replace: true });
    return null;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await login(loginVal.trim(), password);
      navigate(res.must_change_password ? "/change-password" : "/", { replace: true });
    } catch (err) {
      setError(err.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="aerith-backdrop" />
      <div className="relative z-10 w-full max-w-sm fade-in">
        <div className="text-center mb-8">
          <Brand size="xl" />
          <div className="text-muted text-sm mt-3 tracking-wide">Analytics chat workspace</div>
        </div>
        <form
          onSubmit={onSubmit}
          className="card flex flex-col gap-4"
          style={{ boxShadow: "0 30px 80px -20px rgba(12, 0, 50, 0.6)" }}
        >
          <div>
            <label className="label">Login</label>
            <input
              autoFocus
              className="input"
              value={loginVal}
              onChange={(e) => setLoginVal(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="text-sm" style={{ color: "var(--danger)" }}>{error}</div>}
          <button className="btn btn-primary mt-1" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="text-center text-xs text-muted mt-1">
            Have an invite? <Link to="/invite" style={{ color: "var(--accent)" }}>Activate</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

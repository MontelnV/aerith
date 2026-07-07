import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Brand from "../components/Brand";
import { resendVerification, verifyEmail } from "../api/auth";
import { useAuth } from "../context/AuthContext";

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const resendLeft = resendAt > nowMs ? Math.ceil((resendAt - nowMs) / 1000) : 0;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setBusy(true);
    try {
      const res = await verifyEmail(email.trim(), code.trim());
      setUser(res.user);
      navigate(res.must_change_password ? "/change-password" : "/", { replace: true });
    } catch (err) {
      setError(err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    if (!email.trim() || resendLeft > 0 || resendBusy) return;
    setError("");
    setInfo("");
    setResendBusy(true);
    try {
      await resendVerification(email.trim());
      setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setInfo("If this email is pending verification, a new code has been sent.");
    } catch (err) {
      setError(err.message || "Could not resend code");
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="aerith-backdrop" />
      <div className="relative z-10 w-full max-w-sm fade-in">
        <div className="text-center mb-6">
          <Brand size="lg" />
          <div className="text-muted text-sm mt-3">Confirm your email</div>
        </div>
        <form onSubmit={onSubmit} className="card flex flex-col gap-3.5">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="label">Verification code</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              minLength={6}
              maxLength={6}
              required
            />
          </div>
          {error && <div className="text-sm" style={{ color: "var(--danger)" }}>{error}</div>}
          {info && <div className="text-sm text-muted">{info}</div>}
          <button className="btn btn-primary mt-1" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Verify email"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onResend}
            disabled={resendLeft > 0 || resendBusy}
          >
            {resendBusy
              ? "Sending…"
              : resendLeft > 0
                ? `Resend in ${resendLeft}s`
                : "Resend code"}
          </button>
          <div className="text-center text-xs text-muted">
            Already verified? <Link to="/login" style={{ color: "var(--accent)" }}>Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import RegisterPage from "./pages/RegisterPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import LandingPage from "./pages/LandingPage";
import PresentationBackdropPage from "./pages/PresentationBackdropPage";

import ChatPage from "./pages/ChatPage";
import DatasetsPage from "./pages/DatasetsPage";
import MarketplacePage from "./pages/MarketplacePage";
import AppShell from "./components/AppShell";
import GlobalLayout from "./components/GlobalLayout";

import AnalyticsLayout from "./modules/analytics/Layout";
import ModuleWelcomePage from "./components/ModuleWelcomePage";
import ComingSoonPage from "./pages/ComingSoonPage";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && window.location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function LegacyChatRedirect() {
  const { chatId } = useParams();
  return <Navigate to={`/m/analytics/chat/${chatId}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/presentation" element={<PresentationBackdropPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/invite" element={<AcceptInvitePage />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        }
      />
      <Route path="/chat" element={<Navigate to="/m/analytics" replace />} />
      <Route path="/chat/:chatId" element={<LegacyChatRedirect />} />
      <Route path="/datasets" element={<Navigate to="/m/analytics/datasets" replace />} />
      <Route path="/marketplace" element={<Navigate to="/m/analytics/marketplace" replace />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<LandingPage />} />
        <Route path="/m" element={<Navigate to="/m/analytics" replace />} />

        <Route path="/m/analytics" element={<AnalyticsLayout />}>
          <Route index element={<ModuleWelcomePage />} />
          <Route path="chat" element={<Navigate to=".." replace />} />
          <Route path="chat/:chatId" element={<ChatPage />} />
          <Route path="datasets" element={<DatasetsPage />} />
          <Route path="marketplace" element={<MarketplacePage />} />
        </Route>

        <Route path="/m/markets" element={<ComingSoonPage />} />

        <Route element={<GlobalLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

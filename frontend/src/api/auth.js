import { post, get } from "./client";

export const login = (login, password) => post("/auth/login", { login, password });
export const logout = () => post("/auth/logout", {});
export const me = () => get("/auth/me");
export const register = (email, login, password, display_name) =>
  post("/auth/register", { email, login, password, display_name });
export const verifyEmail = (email, code) => post("/auth/verify-email", { email, code });
export const resendVerification = (email) => post("/auth/resend-verification", { email });
export const changePassword = (current_password, new_password) =>
  post("/auth/password", { current_password, new_password });
export const acceptInvite = (token, login, password, display_name) =>
  post("/auth/accept-invite", { token, login, password, display_name });

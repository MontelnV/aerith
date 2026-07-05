import { post, get } from "./client";

export const login = (login, password) => post("/auth/login", { login, password });
export const logout = () => post("/auth/logout", {});
export const me = () => get("/auth/me");
export const changePassword = (current_password, new_password) =>
  post("/auth/password", { current_password, new_password });
export const acceptInvite = (token, login, password, display_name) =>
  post("/auth/accept-invite", { token, login, password, display_name });

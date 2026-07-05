import { get, post, patch, del } from "./client";

export const listUsers = () => get("/admin/users");
export const patchUser = (id, data) => patch(`/admin/users/${id}`, data);
export const listInvites = () => get("/admin/invites");
export const createInvite = (note, ttl_hours) => post("/admin/invites", { note, ttl_hours });
export const revokeInvite = (id) => del(`/admin/invites/${id}`);

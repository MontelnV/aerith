import { get, post, patch, del } from "./client";

export const listProviders = () => get("/llm/providers");
export const createProvider = (data) => post("/llm/providers", data);
export const patchProvider = (id, data) => patch(`/llm/providers/${id}`, data);
export const deleteProvider = (id) => del(`/llm/providers/${id}`);
export const refreshProviderModels = (id) => post(`/llm/providers/${id}/refresh-models`);

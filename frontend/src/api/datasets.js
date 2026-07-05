import { get, post, patch, del, postForm, postFormXHR } from "./client";

export const listDatasets = () => get("/datasets");
export const createExternal = (data) => post("/datasets/external", data);
export const patchDataset = (id, data) => patch(`/datasets/${id}`, data);
export const setVisibility = (id, visibility) => patch(`/datasets/${id}/visibility`, { visibility });
export const deleteDataset = (id) => del(`/datasets/${id}`);
export const testDataset = (id) => post(`/datasets/${id}/test`, {});
export const previewDataset = (id, { schema, table } = {}) => {
  const params = new URLSearchParams();
  if (schema) params.set("schema", schema);
  if (table) params.set("table", table);
  const qs = params.toString();
  return get(`/datasets/${id}/preview${qs ? `?${qs}` : ""}`);
};

export const uploadDataset = (file, name = "", description = "", onProgress) => {
  const form = new FormData();
  form.append("file", file);
  if (name) form.append("name", name);
  if (description) form.append("description", description);
  if (onProgress) return postFormXHR("/datasets/upload", form, onProgress);
  return postForm("/datasets/upload", form);
};

export const retryDataset = (id, file, onProgress) => {
  const form = new FormData();
  form.append("file", file);
  if (onProgress) return postFormXHR(`/datasets/${id}/retry`, form, onProgress);
  return postForm(`/datasets/${id}/retry`, form);
};

export const listMarketplace = () => get("/marketplace/datasets");

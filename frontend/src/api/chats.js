import { get, post, patch, del } from "./client";

export const listChats = (moduleId) => {
  const q = moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : "";
  return get(`/chats${q}`);
};
export const createChat = (data) => post("/chats", data || {});
export const getChat = (id) => get(`/chats/${id}`);
export const patchChat = (id, data) => patch(`/chats/${id}`, data);
export const deleteChat = (id) => del(`/chats/${id}`);
export const listChatDatasets = (id) => get(`/chats/${id}/datasets`);
export const linkDataset = (id, datasetId) =>
  post(`/chats/${id}/datasets`, { dataset_connection_id: datasetId });
export const unlinkDataset = (id, datasetId) => del(`/chats/${id}/datasets/${datasetId}`);

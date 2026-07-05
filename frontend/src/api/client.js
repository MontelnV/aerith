import {
  humanizeApiError,
  isCredentialAuthPath,
  parseErrorDetail,
} from "./errors";

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/+$/, "");

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const init = {
    credentials: "include",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  };
  if (init.body && typeof init.body !== "string" && !(init.body instanceof FormData)) {
    init.body = JSON.stringify(init.body);
  }
  if (init.body instanceof FormData) {
    delete init.headers["Content-Type"];
  }
  const res = await fetch(url, init);
  if (res.status === 401) {
    const detail = await parseErrorDetail(res);
    const credentialForm = isCredentialAuthPath(url);
    if (!credentialForm && onUnauthorized) onUnauthorized();
    throw new HTTPError(
      res.status,
      humanizeApiError(detail, res.status, { credentialForm }),
    );
  }
  if (!res.ok) {
    const detail = await parseErrorDetail(res);
    throw new HTTPError(res.status, humanizeApiError(detail, res.status));
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

class HTTPError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const apiBase = () => API_BASE;
export const get = (p) => request(p);
export const post = (p, body) => request(p, { method: "POST", body });
export const patch = (p, body) => request(p, { method: "PATCH", body });
export const del = (p) => request(p, { method: "DELETE" });
export const postForm = (p, form) => request(p, { method: "POST", body: form });

function parseXhrErrorDetail(xhr) {
  try {
    const data = JSON.parse(xhr.responseText);
    if (!data?.detail) return null;
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item?.msg || item?.message || String(item)).join(". ");
    }
    return JSON.stringify(data.detail);
  } catch {
    return null;
  }
}

export function postFormXHR(path, form, onProgress) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      const total = e.lengthComputable ? e.total : 0;
      const percent = total ? Math.min(99, Math.round((e.loaded / total) * 100)) : 0;
      onProgress({ phase: "uploading", loaded: e.loaded, total, percent });
    };
    xhr.upload.onload = () => {
      if (onProgress) onProgress({ phase: "processing", loaded: 1, total: 1, percent: 100 });
    };
    xhr.onerror = () => reject(new HTTPError(0, "Network error"));
    xhr.onabort = () => reject(new HTTPError(0, "Cancelled"));
    xhr.onload = () => {
      if (xhr.status === 401) {
        const detail = parseXhrErrorDetail(xhr);
        const credentialForm = isCredentialAuthPath(url);
        if (!credentialForm && onUnauthorized) onUnauthorized();
        return reject(
          new HTTPError(
            401,
            humanizeApiError(detail, 401, { credentialForm }),
          ),
        );
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const detail = parseXhrErrorDetail(xhr);
        return reject(new HTTPError(xhr.status, humanizeApiError(detail, xhr.status)));
      }
      if (onProgress) onProgress({ phase: "done", loaded: 1, total: 1, percent: 100 });
      const ct = xhr.getResponseHeader("content-type") || "";
      try {
        resolve(ct.includes("application/json") ? JSON.parse(xhr.responseText) : xhr.responseText);
      } catch (e) {
        resolve(xhr.responseText);
      }
    };
    xhr.send(form);
  });
  promise.abort = () => xhr.abort();
  return promise;
}

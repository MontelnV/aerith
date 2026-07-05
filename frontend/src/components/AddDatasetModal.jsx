import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackdropHandlers } from "./backdropHandlers";
import {
  Database,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import { createExternal, uploadDataset } from "../api/datasets";
import { DATASET_DESCRIPTION_MAX, DATASET_NAME_MAX } from "../constants/datasets";

const SSL_MODES = [
  { v: "disable", t: "Disable SSL" },
  { v: "allow", t: "Allow if possible" },
  { v: "prefer", t: "Prefer SSL" },
  { v: "require", t: "Require SSL" },
  { v: "verify-ca", t: "Verify CA" },
  { v: "verify-full", t: "Full verification" },
];

const ACCEPTED_FILE_TYPES = ".csv,.tsv,.xlsx,.xls";

function formatBytes(n) {
  if (!n && n !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AddDatasetModal({ open, onClose, onCreated, uploadedCount = 0, uploadedLimit = 10 }) {
  const [tab, setTab] = useState("file");
  const [err, setErr] = useState("");
  const backdrop = useBackdropHandlers(onClose);

  useEffect(() => {
    if (!open) {
      setTab("file");
      setErr("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4"
      {...backdrop}
      role="presentation"
    >
      <div
        className="w-full max-w-xl max-h-[min(90vh,760px)] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--bg-elevated)",
          boxShadow: "0 24px 64px rgba(12, 0, 50, 0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-dataset-title"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
          <h2 id="add-dataset-title" className="text-base font-semibold m-0">
            Add dataset
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 shrink-0">
          <div className="ds-modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "file"}
              className={`ds-modal-tab${tab === "file" ? " is-active" : ""}`}
              onClick={() => setTab("file")}
            >
              <FileSpreadsheet size={15} />
              File
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "external"}
              className={`ds-modal-tab${tab === "external" ? " is-active" : ""}`}
              onClick={() => setTab("external")}
            >
              <Database size={15} />
              External PostgreSQL
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4">
          {err && (
            <div
              className="text-sm mb-3 px-3 py-2 rounded-lg"
              style={{
                color: "var(--danger)",
                background: "color-mix(in srgb, var(--danger) 10%, transparent)",
              }}
            >
              {err}
            </div>
          )}

          {tab === "file" ? (
            <FileTab
              uploadedCount={uploadedCount}
              uploadedLimit={uploadedLimit}
              onError={setErr}
              onCreated={(ds) => {
                onCreated?.(ds);
                onClose();
              }}
            />
          ) : (
            <ExternalTab
              onError={setErr}
              onCreated={(ds) => {
                onCreated?.(ds);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FileTab({ uploadedCount, uploadedLimit, onCreated, onError }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const atLimit = uploadedCount >= uploadedLimit;

  const pickFile = useCallback(
    (f) => {
      if (!f) return;
      setFile(f);
      if (!name) {
        const base = (f.name || "").replace(/\.[^.]+$/, "");
        if (base) setName(base.slice(0, DATASET_NAME_MAX));
      }
    },
    [name],
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) pickFile(f);
  };

  const submit = async () => {
    if (!file || busy || atLimit) return;
    onError("");
    setBusy(true);
    try {
      const ds = await uploadDataset(file, name, description);
      onCreated(ds);
    } catch (e) {
      onError(e.message || "Failed to upload file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`ds-dropzone${dragOver ? " is-dragover" : ""}${file ? " is-filled" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] || null)}
        />
        {file ? (
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="shrink-0 inline-flex items-center justify-center rounded-xl"
              style={{
                width: 44,
                height: 44,
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <FileSpreadsheet size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{file.name}</div>
              <div className="text-xs text-muted mt-0.5">
                {formatBytes(file.size)} · {file.type || "file"}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center w-full min-w-0">
            <div
              className="inline-flex items-center justify-center rounded-2xl"
              style={{
                width: 56,
                height: 56,
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
              aria-hidden
            >
              <Upload size={26} />
            </div>
            <div className="text-sm font-semibold">
              Drag a file here or click to choose
            </div>
            <div className="text-xs text-muted">
              CSV · TSV · XLSX · XLS, up to 512 MB
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            disabled={busy}
            placeholder="Name shown in your library"
            maxLength={DATASET_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input input--textarea"
            value={description}
            disabled={busy}
            placeholder="A few words to recognize it later"
            maxLength={DATASET_DESCRIPTION_MAX}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-xs text-muted">
          {atLimit ? (
            <span style={{ color: "var(--danger)" }}>
              Upload limit reached ({uploadedLimit} datasets).
            </span>
          ) : (
            <>Uploaded: {uploadedCount} / {uploadedLimit}</>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!file || busy || atLimit}
          onClick={submit}
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </div>
  );
}

function ExternalTab({ onCreated, onError }) {
  const [ext, setExt] = useState({
    name: "",
    host: "",
    port: 5432,
    database_name: "",
    username: "",
    password: "",
    ssl_mode: "prefer",
    description: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    onError("");
    if (!ext.name.trim() || !ext.host.trim() || !ext.database_name.trim() || !ext.username.trim() || !ext.password) {
      onError("Fill in all required fields");
      return;
    }
    setBusy(true);
    try {
      const ds = await createExternal(ext);
      onCreated(ds);
    } catch (e) {
      onError(e.message || "Failed to create connection");
    } finally {
      setBusy(false);
    }
  };

  const set = (k) => (e) => setExt({ ...ext, [k]: e.target.value });

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="label">Name</label>
        <input className="input" value={ext.name} onChange={set("name")} placeholder="e.g. Product analytics" maxLength={DATASET_NAME_MAX} />
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <div>
          <label className="label">Host</label>
          <input className="input" value={ext.host} onChange={set("host")} placeholder="db.example.com" />
        </div>
        <div>
          <label className="label">Port</label>
          <input
            className="input"
            type="number"
            value={ext.port}
            onChange={(e) => setExt({ ...ext, port: Number(e.target.value) || 5432 })}
          />
        </div>
      </div>
      <div>
        <label className="label">Database</label>
        <input className="input" value={ext.database_name} onChange={set("database_name")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Username</label>
          <input className="input" value={ext.username} onChange={set("username")} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={ext.password} onChange={set("password")} />
        </div>
      </div>
      <div>
        <label className="label">SSL</label>
        <select className="input" value={ext.ssl_mode} onChange={set("ssl_mode")}>
          {SSL_MODES.map(({ v, t }) => (
            <option key={v} value={v}>
              {t} ({v})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Description</label>
        <textarea
          className="input input--textarea"
          value={ext.description}
          onChange={set("description")}
          placeholder="Optional"
          maxLength={DATASET_DESCRIPTION_MAX}
          rows={3}
        />
      </div>

      <div className="flex justify-end pt-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Connecting…" : "Create connection"}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Database, FileSpreadsheet, X } from "lucide-react";
import { patchDataset } from "../api/datasets";
import { DATASET_DESCRIPTION_MAX, DATASET_NAME_MAX } from "../constants/datasets";
import { useBackdropHandlers } from "./backdropHandlers";

const SSL_MODES = [
  { v: "disable", t: "Disable SSL" },
  { v: "allow", t: "Allow if possible" },
  { v: "prefer", t: "Prefer SSL" },
  { v: "require", t: "Require SSL" },
  { v: "verify-ca", t: "Verify CA" },
  { v: "verify-full", t: "Full verification" },
];

export default function EditDatasetModal({ dataset, open, onClose, onSaved }) {
  const isExternal = dataset?.kind === "external_pg";
  const [form, setForm] = useState(() => initialForm(dataset));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const backdrop = useBackdropHandlers(onClose);

  useEffect(() => {
    if (open) {
      setForm(initialForm(dataset));
      setErr("");
    }
  }, [open, dataset]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !dataset) return null;

  const set = (k) => (e) => {
    const val = k === "port" ? Number(e.target.value) || 5432 : e.target.value;
    setForm((prev) => ({ ...prev, [k]: val }));
  };

  const save = async () => {
    setErr("");
    if (!form.name?.trim()) {
      setErr("Name cannot be empty.");
      return;
    }
    const patch = {
      name: form.name.trim(),
      description: form.description ?? "",
    };
    if (isExternal) {
      patch.host = form.host?.trim();
      patch.port = form.port;
      patch.database_name = form.database_name?.trim();
      patch.username = form.username?.trim();
      patch.ssl_mode = form.ssl_mode || "prefer";
      if (form.password) patch.password = form.password;
    }
    setBusy(true);
    try {
      const saved = await patchDataset(dataset.id, patch);
      onSaved?.(saved);
      onClose?.();
    } catch (e) {
      setErr(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

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
        aria-labelledby="edit-dataset-title"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isExternal ? (
              <Database size={16} style={{ color: "var(--accent)" }} />
            ) : (
              <FileSpreadsheet size={16} style={{ color: "var(--accent)" }} />
            )}
            <h2 id="edit-dataset-title" className="text-base font-semibold m-0 truncate">
              Edit dataset
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
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

          <div className="flex flex-col gap-2">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={set("name")}
                placeholder="Name shown in your library"
                maxLength={DATASET_NAME_MAX}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input input--textarea"
                value={form.description}
                onChange={set("description")}
                placeholder="A few words to recognize it later"
                maxLength={DATASET_DESCRIPTION_MAX}
                rows={3}
              />
            </div>

            {isExternal && (
              <>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <div>
                    <label className="label">Host</label>
                    <input className="input" value={form.host} onChange={set("host")} placeholder="db.example.com" />
                  </div>
                  <div>
                    <label className="label">Port</label>
                    <input className="input" type="number" value={form.port} onChange={set("port")} />
                  </div>
                </div>
                <div>
                  <label className="label">Database</label>
                  <input className="input" value={form.database_name} onChange={set("database_name")} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Username</label>
                    <input className="input" value={form.username} onChange={set("username")} />
                  </div>
                  <div>
                    <label className="label">New password</label>
                    <input
                      className="input"
                      type="password"
                      value={form.password}
                      onChange={set("password")}
                      placeholder="Leave blank to keep current password"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">SSL</label>
                  <select className="input" value={form.ssl_mode} onChange={set("ssl_mode")}>
                    {SSL_MODES.map(({ v, t }) => (
                      <option key={v} value={v}>
                        {t} ({v})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 shrink-0">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function initialForm(d) {
  return {
    name: d?.name ?? "",
    description: d?.description ?? "",
    host: d?.host ?? "",
    port: d?.port ?? 5432,
    database_name: d?.database_name ?? "",
    username: d?.username ?? "",
    password: "",
    ssl_mode: d?.ssl_mode || "prefer",
  };
}

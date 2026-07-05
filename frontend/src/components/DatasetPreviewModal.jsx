import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Columns3,
  Database,
  FileSpreadsheet,
  Loader2,
  Table2,
  X,
} from "lucide-react";
import { previewDataset } from "../api/datasets";
import TopScrollTable from "./TopScrollTable";
import { useBackdropHandlers } from "./backdropHandlers";

function formatCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}

function formatNumber(n) {
  if (n == null) return null;
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch {
    return String(n);
  }
}

function PreviewSection({ title, icon: Icon, hint, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ds-preview-section">
      <button
        type="button"
        className="ds-preview-section__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronDown
          size={15}
          className={`ds-preview-section__chevron${open ? " is-open" : ""}`}
          aria-hidden
        />
        <Icon size={14} style={{ color: "var(--accent)" }} aria-hidden />
        <span className="ds-preview-section__title">{title}</span>
        {hint ? <span className="ds-preview-section__hint">{hint}</span> : null}
      </button>
      {open ? <div className="ds-preview-section__body">{children}</div> : null}
    </div>
  );
}

export default function DatasetPreviewModal({ dataset, open, onClose }) {
  const isExternal = dataset?.kind === "external_pg";
  const [data, setData] = useState(null);
  const [tables, setTables] = useState(null);
  const [selected, setSelected] = useState(""); // "schema.table" for external
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const backdrop = useBackdropHandlers(onClose);

  useEffect(() => {
    if (!open || !dataset) return;
    setData(null);
    setTables(null);
    setSelected("");
    setErr("");
    setLoading(true);
    previewDataset(dataset.id)
      .then((res) => {
        if (res.tables) {
          setTables(res.tables);
          if (res.tables.length === 1) {
            const t = res.tables[0];
            loadTable(t.schema, t.table);
          }
        } else {
          setData(res);
        }
      })
      .catch((e) => setErr(e.message || "Failed to load preview"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dataset?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const loadTable = (schema, table) => {
    setSelected(`${schema}.${table}`);
    setErr("");
    setLoading(true);
    setData(null);
    previewDataset(dataset.id, { schema, table })
      .then(setData)
      .catch((e) => setErr(e.message || "Failed to load preview"))
      .finally(() => setLoading(false));
  };

  if (!open || !dataset) return null;

  const columns = data?.columns || [];
  const rows = data?.rows || [];
  const rowCount = formatNumber(data?.row_count ?? dataset.uploaded_row_count);

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4"
      {...backdrop}
      role="presentation"
    >
      <div
        className="w-full max-w-4xl max-h-[min(90vh,820px)] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--bg-elevated)",
          boxShadow: "0 24px 64px rgba(12, 0, 50, 0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dataset-preview-title"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex items-center justify-center rounded-xl shrink-0"
              style={{ width: 38, height: 38, background: "var(--accent-soft)", color: "var(--accent)" }}
              aria-hidden
            >
              {isExternal ? <Database size={18} /> : <FileSpreadsheet size={18} />}
            </div>
            <div className="min-w-0">
              <h2 id="dataset-preview-title" className="text-base font-semibold m-0 truncate">
                {dataset.name}
              </h2>
              <div className="text-xs text-muted mt-0.5">
                {isExternal ? "External PostgreSQL" : "Uploaded file"}
                {rowCount ? <> · {rowCount} rows</> : null}
                {columns.length ? <> · {columns.length} columns</> : null}
              </div>
              {dataset.description ? (
                <p className="ds-preview-desc">{dataset.description}</p>
              ) : (
                <p className="ds-preview-desc ds-preview-desc--empty">
                  No description — add one via Edit so agents and teammates know what this data is.
                </p>
              )}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {err && (
            <div
              className="text-sm mb-3 px-3 py-2 rounded-lg"
              style={{ color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 10%, transparent)" }}
            >
              {err}
            </div>
          )}

          {isExternal && tables && (
            <div className="mb-4">
              <label className="label">Table</label>
              <select
                className="input"
                value={selected}
                onChange={(e) => {
                  const [schema, table] = e.target.value.split(".");
                  if (schema && table) loadTable(schema, table);
                }}
              >
                <option value="" disabled>
                  Select a table ({tables.length})
                </option>
                {tables.map((t) => (
                  <option key={`${t.schema}.${t.table}`} value={`${t.schema}.${t.table}`}>
                    {t.schema}.{t.table}
                  </option>
                ))}
              </select>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted py-8 justify-center">
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)" }} />
              Loading preview…
            </div>
          )}

          {!loading && columns.length > 0 && (
            <div className="ds-preview-sections">
              <PreviewSection title="Columns" icon={Columns3} hint={String(columns.length)}>
                <TopScrollTable>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((c) => (
                        <tr key={c.name}>
                          <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{c.name}</td>
                          <td className="text-muted">{c.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TopScrollTable>
              </PreviewSection>

              <PreviewSection
                title="Sample rows"
                icon={Table2}
                hint={rows.length ? `first ${rows.length}` : "empty"}
              >
                {rows.length ? (
                  <TopScrollTable>
                    <table>
                      <thead>
                        <tr>
                          {columns.map((c) => (
                            <th key={c.name}>{c.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            {columns.map((c) => (
                              <td key={c.name}>{formatCell(r[c.name])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TopScrollTable>
                ) : (
                  <div className="text-sm text-muted">Table is empty.</div>
                )}
              </PreviewSection>
            </div>
          )}

          {!loading && !err && isExternal && tables && !selected && tables.length !== 1 && (
            <div className="text-sm text-muted">
              Select a table above to see its columns and sample rows.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

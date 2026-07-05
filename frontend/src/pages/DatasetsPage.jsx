import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Globe,
  Lock,
  Loader2,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import AddDatasetModal from "../components/AddDatasetModal";
import DatasetPreviewModal from "../components/DatasetPreviewModal";
import EditDatasetModal from "../components/EditDatasetModal";
import { useBackdropHandlers } from "../components/backdropHandlers";
import {
  deleteDataset,
  listDatasets,
  retryDataset,
  setVisibility,
  testDataset,
} from "../api/datasets";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "file", label: "Files" },
  { id: "db", label: "DB" },
  { id: "public", label: "Public" },
];

const ACTIVE_STATUSES = new Set(["uploading", "processing"]);

function normalizeDs(d) {
  return {
    ...d,
    status: d.status || "ready",
  };
}

function formatNumber(n) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch {
    return String(n);
  }
}

function columnsCount(d) {
  const cols = d?.uploaded_columns?.columns;
  return Array.isArray(cols) ? cols.length : null;
}

function ago(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString("en-US");
}

export default function DatasetsPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const pollRef = useRef({ timer: null, cancelled: false, tick: null });

  const reload = async () => {
    try {
      const fresh = await listDatasets();
      const normalized = (fresh || []).map(normalizeDs);
      setItems(normalized);
      setErr("");
      return normalized;
    } catch (e) {
      setErr(e.message || "Failed to load list");
      return null;
    }
  };

  useEffect(() => {
    pollRef.current.cancelled = false;

    const tick = async () => {
      if (pollRef.current.cancelled) return;
      const normalized = await reload();
      if (pollRef.current.cancelled) return;
      setLoading(false);
      const list = Array.isArray(normalized) ? normalized : [];
      const hasActive = list.some((d) => ACTIVE_STATUSES.has(d.status));
      pollRef.current.timer = setTimeout(tick, hasActive ? 1500 : 15000);
    };

    pollRef.current.tick = tick;
    tick();

    return () => {
      pollRef.current.cancelled = true;
      pollRef.current.tick = null;
      if (pollRef.current.timer) {
        clearTimeout(pollRef.current.timer);
        pollRef.current.timer = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pokePoll = () => {
    if (pollRef.current.timer) {
      clearTimeout(pollRef.current.timer);
      pollRef.current.timer = null;
    }
    const t = pollRef.current.tick;
    if (t) t();
  };

  const onCreated = (ds) => {
    if (!ds) return;
    setItems((prev) => {
      const filtered = prev.filter((x) => x.id !== ds.id);
      return [normalizeDs(ds), ...filtered];
    });
    pokePoll();
  };

  const uploadedCount = useMemo(
    () => items.filter((d) => d.kind === "uploaded").length,
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((d) => {
      if (filter === "file" && d.kind !== "uploaded") return false;
      if (filter === "db" && d.kind !== "external_pg") return false;
      if (filter === "public" && d.visibility !== "public") return false;
      if (!q) return true;
      const hay = [
        d.name,
        d.description,
        d.source_filename,
        d.host,
        d.database_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter, query]);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <div className="ds-header">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold m-0">My datasets</h1>
            <p className="text-muted text-sm m-0 mt-1">
              Uploaded CSV/XLSX files and external database connections.
            </p>
          </div>
        </div>

        <div className="ds-toolbar">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              className="input input--leading-icon"
              placeholder="Search by name, description, file…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ds-segmented" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`ds-segmented__btn${filter === f.id ? " is-active" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div
            className="mb-4 px-3 py-2 rounded-lg text-sm"
            style={{
              color: "var(--danger)",
              background: "color-mix(in srgb, var(--danger) 10%, transparent)",
            }}
          >
            {err}
          </div>
        )}

        {loading ? (
          <div className="ds-empty">
            <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent)" }} />
            <div>Loading list…</div>
          </div>
        ) : (
          <div className="ds-gallery">
            {filtered.map((d) => (
              <DatasetCard
                key={d.id}
                d={d}
                onChanged={reload}
                onRemoved={() =>
                  setItems((prev) => prev.filter((x) => x.id !== d.id))
                }
              />
            ))}
            <AddDatasetTile onClick={() => setModalOpen(true)} />
          </div>
        )}
      </div>

      <AddDatasetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={onCreated}
        uploadedCount={uploadedCount}
        uploadedLimit={10}
      />
    </div>
  );
}

function AddDatasetTile({ onClick }) {
  return (
    <button
      type="button"
      className="ds-card ds-card--add"
      onClick={onClick}
      aria-label="Add dataset"
    >
      <span className="ds-card--add__icon" aria-hidden>
        <Plus size={22} strokeWidth={2.2} />
      </span>
      <span className="ds-card--add__title">Add dataset</span>
      <span className="ds-card--add__hint">CSV, XLSX, or external DB</span>
    </button>
  );
}

function DatasetCard({ d, onChanged, onRemoved }) {
  const isUploaded = d.kind === "uploaded";
  const isExternal = d.kind === "external_pg";
  const isActive = ACTIVE_STATUSES.has(d.status);
  const isFailed = d.status === "failed";
  const isReady = d.status === "ready";
  const isPublic = d.visibility === "public";

  const [busy, setBusy] = useState(false);
  const [testState, setTestState] = useState(null); // { kind: 'ok'|'error', info?, error? }
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const retryInputRef = useRef(null);

  const guard = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setTestState({ kind: "error", error: e.message || "Error" });
    } finally {
      setBusy(false);
    }
  };

  const applyVisibility = (next) =>
    guard(async () => {
      await setVisibility(d.id, next);
      await onChanged();
    });

  const onVisSwitch = () => {
    if (!isReady || busy) return;
    if (isPublic) {
      applyVisibility("private");
    } else {
      setConfirmPublishOpen(true);
    }
  };

  const doDelete = () => {
    if (busy) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () =>
    guard(async () => {
      await deleteDataset(d.id);
      setConfirmDeleteOpen(false);
      onRemoved();
    });

  const doTest = () =>
    guard(async () => {
      setTestState(null);
      const r = await testDataset(d.id);
      if (r.ok) setTestState({ kind: "ok", info: r.info || {} });
      else setTestState({ kind: "error", error: r.error || "Connection failed" });
    });

  const doRetry = (file) => {
    if (!file) return;
    guard(async () => {
      await retryDataset(d.id, file);
      await onChanged();
    });
  };

  const Icon = isUploaded ? FileSpreadsheet : Server;
  const subtitle = isUploaded ? "Uploaded file" : "External PostgreSQL";

  const metaLine = useMemo(() => {
    const parts = [];
    if (isUploaded) {
      if (d.uploaded_row_count != null) {
        parts.push(`${formatNumber(d.uploaded_row_count)} rows`);
      }
      const cc = columnsCount(d);
      if (cc != null) parts.push(`${cc} columns`);
    } else if (isExternal) {
      if (d.database_name) parts.push(`db: ${d.database_name}`);
      if (d.username) parts.push(`user: ${d.username}`);
    }
    return parts.join(" · ");
  }, [d, isUploaded, isExternal]);

  const sourceLine = useMemo(() => {
    if (!isExternal) return null;
    const host = d.host || "?";
    const port = d.port || 5432;
    const db = d.database_name || "?";
    return `${host}:${port}/${db}`;
  }, [d, isExternal]);

  return (
    <>
      <div
        className={`ds-card v2${isActive ? " is-active" : ""}${isFailed ? " is-failed" : ""}${isPublic ? " is-public" : ""}`}
        data-status={d.status}
      >
        <div className="ds-card__top">
          <div
            className="ds-card__icon"
            aria-hidden
            style={{
              background: isPublic
                ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                : "var(--accent-soft)",
              color: "var(--accent)",
            }}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="ds-card__name ds-card__name--link"
              onClick={() => isReady && setPreviewOpen(true)}
              disabled={!isReady}
              title={isReady ? "Open preview: columns and sample rows" : undefined}
            >
              {d.name}
            </button>
            <div className="ds-card__subtitle">
              <span>{subtitle}</span>
              <span className="ds-card__dot" aria-hidden />
              <span>updated {ago(d.updated_at)}</span>
            </div>
          </div>
          <StatusBadge status={d.status} error={d.status_error} />
        </div>

        <div className="ds-card__info">
          {d.description ? (
            <div className="ds-card__description">{d.description}</div>
          ) : (
            <div className="ds-card__description ds-card__description--empty">
              No description yet — add one so it's clear what this data is.
            </div>
          )}
          {sourceLine && (
            <div className="ds-card__source" title={sourceLine}>
              {sourceLine}
            </div>
          )}
          {metaLine && <div className="ds-card__meta">{metaLine}</div>}
        </div>

        {testState && (
          <TestResultView
            state={testState}
            kind={d.kind}
            onClose={() => setTestState(null)}
          />
        )}

        {isActive && (
          <div className="ds-card__progress" aria-hidden>
            <span />
          </div>
        )}

        <div className="ds-card__toolbar">
          {isFailed ? (
            <>
              <div className="ds-card__failed-hint" title={d.status_error || ""}>
                {d.status_error ? `Error: ${d.status_error}` : "Processing failed"}
              </div>
              <div className="ds-card__icons">
                <input
                  ref={retryInputRef}
                  type="file"
                  accept=".csv,.tsv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) doRetry(f);
                    if (retryInputRef.current) retryInputRef.current.value = "";
                  }}
                />
                <IconAction
                  title="Re-upload file and retry processing"
                  onClick={() => retryInputRef.current?.click()}
                  disabled={busy}
                  variant="accent"
                >
                  <RefreshCw size={15} />
                </IconAction>
                <IconAction title="Delete" onClick={doDelete} disabled={busy} variant="danger">
                  <Trash2 size={15} />
                </IconAction>
              </div>
            </>
          ) : (
            <>
              <VisibilitySwitch
                value={isPublic ? "public" : "private"}
                disabled={!isReady || busy}
                onChange={onVisSwitch}
              />
              <div className="ds-card__icons">
                <IconAction
                  title={isReady ? "Preview columns and sample rows" : "Available after processing"}
                  onClick={() => setPreviewOpen(true)}
                  disabled={!isReady || busy}
                  variant="accent"
                >
                  <Eye size={15} />
                </IconAction>
                <IconAction
                  title={
                    isReady
                      ? isUploaded
                        ? "Verify table is accessible"
                        : "Test connection"
                      : "Available after processing"
                  }
                  onClick={doTest}
                  disabled={!isReady || busy}
                  active={testState?.kind === "ok"}
                  variant="accent"
                >
                  <Zap size={15} />
                </IconAction>
                <IconAction
                  title="Edit"
                  onClick={() => setEditOpen(true)}
                  disabled={busy}
                >
                  <Pencil size={15} />
                </IconAction>
                <IconAction title="Delete" onClick={doDelete} disabled={busy} variant="danger">
                  <Trash2 size={15} />
                </IconAction>
              </div>
            </>
          )}
        </div>
      </div>

      <DatasetPreviewModal
        dataset={d}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <EditDatasetModal
        dataset={d}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          onChanged();
        }}
      />

      <ConfirmPublishModal
        open={confirmPublishOpen}
        name={d.name}
        busy={busy}
        onClose={() => setConfirmPublishOpen(false)}
        onConfirm={async () => {
          setConfirmPublishOpen(false);
          await applyVisibility("public");
        }}
      />

      <ConfirmDeleteModal
        open={confirmDeleteOpen}
        name={d.name}
        kind={d.kind}
        busy={busy}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function IconAction({ children, title, onClick, disabled, active, variant }) {
  const cls =
    "ds-icon-btn" +
    (active ? " is-active" : "") +
    (variant === "danger" ? " ds-icon-btn--danger" : "") +
    (variant === "accent" ? " ds-icon-btn--accent" : "");
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title} aria-label={title}>
      {children}
    </button>
  );
}

function VisibilitySwitch({ value, disabled, onChange }) {
  const isPublic = value === "public";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isPublic}
      aria-label={isPublic ? "Public — listed in the marketplace. Click to make private." : "Private. Click to publish."}
      className={`ds-switch${isPublic ? " is-on" : ""}`}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="ds-switch__track">
        <span className="ds-switch__thumb">
          {isPublic ? <Globe size={10} strokeWidth={2.4} /> : <Lock size={10} strokeWidth={2.4} />}
        </span>
      </span>
      <span className="ds-switch__label">
        {isPublic ? "Public" : "Private"}
      </span>
    </button>
  );
}

function TestResultView({ state, kind, onClose }) {
  if (state.kind === "error") {
    return (
      <div className="ds-test-panel ds-test-panel--err">
        <div className="ds-test-panel__head">
          <AlertTriangle size={13} />
          <span>Check failed</span>
          <button type="button" className="ds-test-panel__close" onClick={onClose} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
        <div className="ds-test-panel__body">{state.error}</div>
      </div>
    );
  }
  const headline = kind === "uploaded" ? "Table accessible" : "Connection works";
  return (
    <div className="ds-test-badge">
      <CheckCircle2 size={12} aria-hidden />
      <span>{headline}</span>
      <button type="button" className="ds-test-badge__close" onClick={onClose} aria-label="Dismiss">
        <X size={11} />
      </button>
    </div>
  );
}

const PUBLISH_JOKES = [
  "Everyone on AERITH will see this dataset once you publish. Before you hit OK, make sure your columns don't include `password_plaintext` or photos from the office party.",
  "Public datasets appear in the marketplace and can be used by others. We hope your DBA forgives you — or at least never finds out.",
  "Sharing data means sharing responsibility. If the table has your colleagues' salaries — maybe don't.",
];

function ConfirmDeleteModal({ open, name, kind, busy, onClose, onConfirm }) {
  const backdrop = useBackdropHandlers(onClose);
  const isUploaded = kind === "uploaded";

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
      className="modal-backdrop fixed inset-0 z-[210] flex items-center justify-center p-4"
      {...backdrop}
      role="presentation"
    >
      <div
        className="publish-modal publish-modal--danger"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
      >
        <button
          type="button"
          className="publish-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <div className="publish-modal__hero" aria-hidden>
          <div className="publish-modal__hero-glow" />
          <div className="publish-modal__hero-icon">
            <Trash2 size={26} strokeWidth={1.8} />
          </div>
        </div>
        <div className="publish-modal__body">
          <div className="publish-modal__kicker">Delete dataset</div>
          <h2 id="delete-confirm-title" className="publish-modal__title" title={name}>
            {name}
          </h2>
          <p className="publish-modal__lead">
            {isUploaded
              ? "The uploaded table and all stored rows will be permanently removed. This cannot be undone."
              : "The connection will be removed from your library. The external database itself is not affected."}
          </p>
        </div>
        <div className="publish-modal__footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={busy}
          >
            <Trash2 size={14} /> {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConfirmPublishModal({ open, name, busy, onClose, onConfirm }) {
  const joke = useMemo(
    () => PUBLISH_JOKES[Math.floor(Math.random() * PUBLISH_JOKES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );
  const backdrop = useBackdropHandlers(onClose);
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
      className="modal-backdrop fixed inset-0 z-[210] flex items-center justify-center p-4"
      {...backdrop}
      role="presentation"
    >
      <div
        className="publish-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-confirm-title"
      >
        <button
          type="button"
          className="publish-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <div className="publish-modal__hero" aria-hidden>
          <div className="publish-modal__hero-glow" />
          <div className="publish-modal__hero-icon">
            <Globe size={26} strokeWidth={1.8} />
          </div>
        </div>
        <div className="publish-modal__body">
          <div className="publish-modal__kicker">Publish dataset</div>
          <h2
            id="publish-confirm-title"
            className="publish-modal__title"
            title={name}
          >
            {name}
          </h2>
          <p className="publish-modal__lead">
            This dataset will be visible to all AERITH users via the marketplace. You can
            unpublish it with the same switch.
          </p>
          <div className="publish-modal__joke" role="note">
            <AlertTriangle
              size={15}
              className="shrink-0 mt-0.5"
              style={{ color: "var(--accent)" }}
              aria-hidden
            />
            <span>{joke}</span>
          </div>
        </div>
        <div className="publish-modal__footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            <Globe size={14} /> Yes, publish
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatusBadge({ status, error }) {
  if (status === "failed") {
    return (
      <span
        className="ds-status ds-status--failed"
        title={error || "Processing failed"}
      >
        <AlertTriangle size={11} />
        Failed
      </span>
    );
  }
  return null;
}

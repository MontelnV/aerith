import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, FileSpreadsheet, MessageSquarePlus, Search, Server } from "lucide-react";
import DatasetPreviewModal from "../components/DatasetPreviewModal";
import { listMarketplace } from "../api/datasets";
import { createChat, linkDataset } from "../api/chats";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "file", label: "Files" },
  { id: "db", label: "DB" },
];

function formatNumber(n) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-US").format(n);
  } catch {
    return String(n);
  }
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

export default function MarketplacePage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try { setItems(await listMarketplace()); } catch (e) { setErr(e.message); }
    })();
  }, []);

  const attachToNewChat = async (ds) => {
    const chat = await createChat({
      title: ds.name,
      chat_mode: "analytics",
      module_id: "analytics",
    });
    try { await linkDataset(chat.id, ds.id); } catch {}
    navigate(`/m/analytics/chat/${chat.id}`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((d) => {
      if (filter === "file" && d.kind !== "uploaded") return false;
      if (filter === "db" && d.kind !== "external_pg") return false;
      if (!q) return true;
      const hay = [
        d.name,
        d.description,
        d.source_filename,
        d.owner_display_name,
        d.owner_login,
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
            <h1 className="text-2xl font-semibold m-0">Marketplace</h1>
            <p className="text-muted text-sm m-0 mt-1">
              Public datasets shared by AERITH users. Analyze them in chat without
              direct access to the underlying data.
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
              placeholder="Search by name, description, owner…"
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

        <div className="ds-gallery">
          {filtered.map((d) => (
            <MarketplaceCard key={d.id} d={d} onAnalyze={() => attachToNewChat(d)} />
          ))}
          {filtered.length === 0 && (
            <div className="text-muted text-sm col-span-full">
              {items.length === 0
                ? "The marketplace is empty."
                : "Nothing matches your search."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketplaceCard({ d, onAnalyze }) {
  const isUploaded = d.kind === "uploaded";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const Icon = isUploaded ? FileSpreadsheet : Server;
  const subtitle = isUploaded ? "Uploaded file" : "External PostgreSQL";
  const owner = d.owner_display_name || d.owner_login || "unknown";

  const metaLine = useMemo(() => {
    const parts = [];
    if (isUploaded) {
      if (d.uploaded_row_count != null) {
        parts.push(`${formatNumber(d.uploaded_row_count)} rows`);
      }
      const cols = d.uploaded_columns?.columns;
      if (Array.isArray(cols)) parts.push(`${cols.length} columns`);
    }
    return parts.join(" · ");
  }, [d, isUploaded]);

  const analyze = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAnalyze();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ds-card v2 is-public">
        <div className="ds-card__top">
          <div
            className="ds-card__icon"
            aria-hidden
            style={{
              background: "color-mix(in srgb, var(--accent) 18%, transparent)",
              color: "var(--accent)",
            }}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="ds-card__name ds-card__name--link"
              onClick={() => setPreviewOpen(true)}
              title="Open preview: columns and sample rows"
            >
              {d.name}
            </button>
            <div className="ds-card__subtitle">
              <span>{subtitle}</span>
              <span className="ds-card__dot" aria-hidden />
              <span>updated {ago(d.updated_at)}</span>
            </div>
          </div>
        </div>

        <div className="ds-card__info">
          {d.description ? (
            <div className="ds-card__description">{d.description}</div>
          ) : (
            <div className="ds-card__description ds-card__description--empty">
              The owner has not added a description yet.
            </div>
          )}
          <div className="ds-card__meta">
            by {owner}
            {metaLine ? ` · ${metaLine}` : ""}
          </div>
        </div>

        <div className="ds-card__toolbar">
          <button
            type="button"
            className="btn btn-primary ds-card__analyze"
            onClick={analyze}
            disabled={busy}
          >
            <MessageSquarePlus size={14} />
            {busy ? "Opening…" : "Analyze in new chat"}
          </button>
          <div className="ds-card__icons">
            <button
              type="button"
              className="ds-icon-btn ds-icon-btn--accent"
              onClick={() => setPreviewOpen(true)}
              title="Preview columns and sample rows"
              aria-label="Preview columns and sample rows"
            >
              <Eye size={15} />
            </button>
          </div>
        </div>
      </div>

      <DatasetPreviewModal
        dataset={d}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

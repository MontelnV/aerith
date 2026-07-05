import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Database, Cloud, Search, ChevronRight, Zap, Check, AlertTriangle } from "lucide-react";
import { listDatasets, listMarketplace } from "../api/datasets";
import { linkDataset, listChatDatasets, unlinkDataset } from "../api/chats";
import { useBackdropHandlers } from "./backdropHandlers";

const TOOL_LABELS = {
  sql_query: "SQL query",
  execute_sql: "SQL query",
  run_sql: "SQL query",
  preview_table: "preview",
  list_tables: "table list",
  describe_table: "table schema",
  schema: "schema",
  describe: "description",
  count_rows: "row count",
};

function humanTool(name) {
  if (!name) return null;
  return TOOL_LABELS[name] || name.replace(/_/g, " ");
}

function ActivityBadge({ status, tool }) {
  if (!status) return null;
  if (status === "active") {
    return (
      <div
        className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
        style={{
          color: "var(--accent)",
          background: "var(--accent-soft)",
          boxShadow: "var(--accent-shadow, 0 0 0 1px var(--accent-soft))",
        }}
        title={tool ? `Running: ${humanTool(tool)}` : "Model is querying the dataset"}
      >
        <span className="relative inline-flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping"
            style={{ background: "var(--accent)" }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        </span>
        {tool ? humanTool(tool) : "query"}
      </div>
    );
  }
  if (status === "done") {
    return (
      <span
        className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        title="Success"
      >
        <Check size={12} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
        style={{ background: "rgba(244, 63, 94, 0.14)", color: "var(--danger)" }}
        title="Error"
      >
        <AlertTriangle size={12} strokeWidth={2.5} />
      </span>
    );
  }
  return null;
}

function DatasetPicker({
  chatId,
  maxPerChat = 10,
  onChange,
  activity,
  singleActivity,
  isStreaming,
  collapsed = false,
}, ref) {
  const [linked, setLinked] = useState([]);
  const [mine, setMine] = useState([]);
  const [pub, setPub] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const backdrop = useBackdropHandlers(() => setModalOpen(false));
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [err, setErr] = useState("");

  const reload = async () => {
    try {
      const [l, m, p] = await Promise.all([listChatDatasets(chatId), listDatasets(), listMarketplace()]);
      setLinked(l);
      setMine(m);
      setPub(p);
      onChange?.(l);
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    if (chatId) reload();
    // eslint-disable-next-line
  }, [chatId]);

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const linkedIds = useMemo(() => new Set(linked.map((d) => d.id)), [linked]);

  const filteredRows = useMemo(() => {
    const mineAvail = mine.filter((d) => !linkedIds.has(d.id)).map((d) => ({ ...d, _src: "mine" }));
    const pubAvail = pub
      .filter((d) => !linkedIds.has(d.id) && !mine.some((m) => m.id === d.id))
      .map((d) => ({ ...d, _src: "pub" }));
    let pool =
      sourceFilter === "mine" ? mineAvail : sourceFilter === "public" ? pubAvail : [...mineAvail, ...pubAvail];
    const q = search.trim().toLowerCase();
    if (q) {
      pool = pool.filter((d) => {
        const name = (d.name || "").toLowerCase();
        const desc = (d.description || "").toLowerCase();
        const owner = `${d.owner_login || ""} ${d.owner_display_name || ""}`.toLowerCase();
        return name.includes(q) || desc.includes(q) || owner.includes(q);
      });
    }
    return pool;
  }, [mine, pub, linkedIds, search, sourceFilter]);

  const link = async (id) => {
    setErr("");
    try {
      await linkDataset(chatId, id);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  const unlink = async (id) => {
    setErr("");
    try {
      await unlinkDataset(chatId, id);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  const openModal = () => {
    setSearch("");
    setSourceFilter("all");
    setErr("");
    setModalOpen(true);
  };

  useImperativeHandle(ref, () => ({
    openModal,
    isAtLimit: () => linked.length >= maxPerChat,
    linkedCount: () => linked.length,
    maxPerChat,
  }), [linked.length, maxPerChat]);

  const atLimit = linked.length >= maxPerChat;

  const modalJsx = modalOpen ? createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4"
      {...backdrop}
      role="presentation"
    >
      <div
        className="w-full max-w-lg max-h-[min(85vh,640px)] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)",
          boxShadow: "0 24px 64px rgba(12, 0, 50, 0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dataset-modal-title"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
          <h2 id="dataset-modal-title" className="text-base font-semibold m-0">
            Link dataset
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            onClick={() => setModalOpen(false)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pt-3 pb-2 shrink-0 flex flex-col gap-2">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              className="input input--leading-icon"
              placeholder="Search by name, description, owner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-1 p-0.5 rounded-full" style={{ background: "var(--surface-muted)" }}>
            {[
              { id: "all", label: "All" },
              { id: "mine", label: "Mine" },
              { id: "public", label: "Public" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className="flex-1 text-xs font-semibold py-1.5 px-2 rounded-full transition-colors hover:opacity-90"
                style={
                  sourceFilter === id
                    ? { background: "var(--accent)", color: "#fff" }
                    : { color: "var(--text-muted)", background: "transparent" }
                }
                onClick={() => setSourceFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {err && modalOpen && (
          <div className="px-4 text-xs shrink-0" style={{ color: "var(--danger)" }}>
            {err}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          <div className="flex flex-col gap-2">
            {filteredRows.map((d) => {
              const ownerLine =
                d._src === "pub" && (d.owner_display_name || d.owner_login)
                  ? d.owner_display_name || d.owner_login
                  : null;
              const meta = [d.description?.trim(), ownerLine].filter(Boolean).join(" · ");
              const status = d.status || "ready";
              const notReady = status !== "ready";
              const disabled = atLimit || notReady;
              const statusHint =
                status === "uploading"
                  ? "File is still uploading to the server"
                  : status === "processing"
                    ? "File is still processing. It will be available in a few seconds"
                    : status === "failed"
                      ? "File processing failed"
                      : null;
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={disabled}
                  title={statusHint || undefined}
                  className="group w-full text-left rounded-2xl border px-3 py-3 transition-all duration-200 disabled:opacity-45 disabled:pointer-events-none hover:border-[var(--border-strong)]"
                  style={{
                    borderColor: "var(--border-subtle)",
                    background: "var(--bg-surface)",
                  }}
                  onClick={() => link(d.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: "var(--accent-soft)" }}
                    >
                      {d.kind === "uploaded" ? (
                        <Cloud size={18} style={{ color: "var(--accent)" }} strokeWidth={1.75} />
                      ) : (
                        <Database size={18} style={{ color: "var(--accent)" }} strokeWidth={1.75} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="text-sm font-semibold leading-snug tracking-tight truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {d.name}
                        </span>
                        <span
                          className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {d.kind === "uploaded" ? "file" : "DB"}
                        </span>
                      </div>
                      {meta ? (
                        <p
                          className="text-xs mt-1.5 line-clamp-2 leading-relaxed"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {meta}
                        </p>
                      ) : null}
                      {notReady && (
                        <div
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                          style={{
                            color:
                              status === "failed"
                                ? "var(--danger)"
                                : "var(--accent)",
                          }}
                        >
                          {status === "uploading" && "uploading…"}
                          {status === "processing" && "processing…"}
                          {status === "failed" && "processing failed"}
                        </div>
                      )}
                    </div>
                    <ChevronRight
                      size={18}
                      className="shrink-0 mt-2 opacity-0 group-hover:opacity-35 transition-opacity"
                      style={{ color: "var(--text-muted)" }}
                      strokeWidth={2}
                    />
                  </div>
                </button>
              );
            })}
            {filteredRows.length === 0 && (
              <div className="text-sm text-muted text-center py-8 px-4">
                {search.trim() ? "No results found" : "No datasets available to link"}
              </div>
            )}
          </div>
        </div>
        <div className="px-4 py-2.5 text-xs text-muted shrink-0">
          Linked {linked.length} / {maxPerChat}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  const computedActivity = (d) => {
    const perId = activity?.[d.id];
    const fallback =
      linked.length === 1 && !perId && singleActivity ? singleActivity : null;
    return perId || fallback;
  };

  if (collapsed) {
    return (
      <>
        <div className="flex flex-col items-center gap-2 py-3">
          {linked.map((d) => {
            const act = computedActivity(d);
            const isActive = act?.status === "active";
            const isDone = act?.status === "done";
            const isErr = act?.status === "error";
            return (
              <div key={d.id} className="relative group">
                <button
                  type="button"
                  className={`ds-row shrink-0 inline-flex items-center justify-center rounded-xl border transition-[border-color,background-color] duration-200 ${isActive ? "ds-row--active" : ""}`}
                  style={{
                    width: 36,
                    height: 36,
                    borderColor: isActive ? "transparent" : "var(--border-subtle)",
                    background: isActive ? "var(--accent-soft)" : "var(--bg-surface)",
                    color: isActive ? "var(--accent)" : "var(--text-primary)",
                    boxShadow: "none",
                  }}
                  title={`${d.name}${act?.tool ? ` — ${humanTool(act.tool)}` : ""}`}
                  aria-label={d.name}
                >
                  {d.kind === "uploaded" ? (
                    <Cloud size={15} strokeWidth={2} />
                  ) : (
                    <Database size={15} strokeWidth={2} />
                  )}
                </button>
                {isDone && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
                    style={{ background: "var(--accent)" }}
                    aria-hidden
                  />
                )}
                {isErr && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
                    style={{ background: "var(--danger)" }}
                    aria-hidden
                  />
                )}
              </div>
            );
          })}
        </div>
        {modalJsx}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {err && !modalOpen && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {err}
          </div>
        )}
        {linked.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {linked.map((d) => {
              const perId = activity?.[d.id];
              const fallback =
                linked.length === 1 && !perId && singleActivity ? singleActivity : null;
              const act = perId || fallback;
              const isActive = act?.status === "active";
              const isDone = act?.status === "done";
              const isErr = act?.status === "error";
              return (
                <div
                  key={d.id}
                  className={`ds-row flex items-center gap-2.5 min-w-0 rounded-2xl border px-2.5 py-2 transition-[border-color,box-shadow,background-color] duration-200 ${isActive ? "ds-row--active" : ""}`}
                  title={isActive && act?.tool ? `Running: ${humanTool(act.tool)}` : undefined}
                  style={{
                    borderColor: isActive ? "transparent" : "var(--border-subtle)",
                    background: isActive
                      ? "color-mix(in srgb, var(--accent-soft) 70%, var(--bg-surface))"
                      : "var(--bg-surface)",
                    boxShadow: isActive
                      ? "0 8px 24px -12px rgba(0,0,0,0.25)"
                      : "none",
                  }}
                >
                  <div
                    className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center relative"
                    style={{ background: "var(--accent-soft)" }}
                  >
                    {d.kind === "uploaded" ? (
                      <Cloud size={14} style={{ color: "var(--accent)" }} strokeWidth={2} />
                    ) : (
                      <Database size={14} style={{ color: "var(--accent)" }} strokeWidth={2} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm font-medium truncate leading-tight"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {d.name}
                    </div>
                    <div
                      className="text-[10px] uppercase tracking-[0.12em] mt-0.5 flex items-center gap-1.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span>{d.kind === "uploaded" ? "file" : "external DB"}</span>
                    </div>
                  </div>
                  {isDone && (
                    <span
                      className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                      title="Success"
                    >
                      <Check size={12} strokeWidth={2.5} />
                    </span>
                  )}
                  {isErr && (
                    <span
                      className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
                      style={{ background: "rgba(244, 63, 94, 0.14)", color: "var(--danger)" }}
                      title="Error"
                    >
                      <AlertTriangle size={12} strokeWidth={2.5} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-raised)]"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => unlink(d.id)}
                    title="Unlink"
                    aria-label={`Unlink ${d.name}`}
                    disabled={isActive && isStreaming}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalJsx}
    </>
  );
}

export default forwardRef(DatasetPicker);

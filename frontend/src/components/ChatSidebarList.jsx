import { MessagesSquare, Trash2 } from "lucide-react";

export default function ChatSidebarList({ chats, activeId, onSelect, onDelete }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] shrink-0">
        Chats
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2 py-1 flex flex-col gap-1.5">
        {chats.map((c) => {
          const active = activeId === c.id;
          return (
            <div
              key={c.id}
              className={`group relative flex items-center gap-2.5 rounded-xl border px-2.5 py-2 cursor-pointer text-sm transition-theme ease-out ${
                active
                  ? "border-[var(--border-subtle)] bg-[var(--bg-raised)]"
                  : "border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-raised)]"
              }`}
              onClick={() => onSelect(c.id)}
            >
              <div
                className={`w-1 shrink-0 self-stretch min-h-[1.25rem] rounded-full transition-theme ${
                  active ? "bg-[var(--accent)]" : "bg-[var(--border-subtle)] opacity-40 group-hover:opacity-70"
                }`}
                aria-hidden
              />
              <span
                className="shrink-0 inline-flex items-center justify-center rounded-lg transition-theme"
                style={{
                  width: 24,
                  height: 24,
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-muted)",
                }}
                aria-hidden
              >
                <MessagesSquare size={13} strokeWidth={1.9} />
              </span>
              <span
                className={`flex-1 truncate min-w-0 leading-snug ${
                  active
                    ? "font-semibold text-[var(--text-primary)]"
                    : "font-medium text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                }`}
              >
                {c.title}
              </span>
              <button
                type="button"
                className="focus-ring-neutral inline-flex shrink-0 items-center justify-center rounded-md p-1 text-[var(--text-muted)] opacity-0 pointer-events-none transition-all duration-150 hover:bg-[var(--bg-raised)] hover:text-[var(--danger)] group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this chat?")) onDelete(c.id);
                }}
                title="Delete chat"
                aria-label="Delete chat"
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          );
        })}
        {chats.length === 0 && (
          <div className="text-muted text-xs p-3 text-center">No chats yet</div>
        )}
      </div>
    </div>
  );
}

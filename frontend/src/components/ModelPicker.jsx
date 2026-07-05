import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Search } from "lucide-react";
import { listProviders } from "../api/llm";

/**
 * Per-chat provider/model selector shown as a compact chip in the composer.
 * Saves the choice on the chat via PATCH (parent passes onChange).
 */
export default function ModelPicker({ chat, disabled, onChange }) {
  const [providers, setProviders] = useState(null); // null = loading
  const [open, setOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    listProviders()
      .then((data) => {
        if (!cancelled) setProviders(data.providers || []);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const initialProviderId = useMemo(() => {
    const list = providers || [];
    const fromChat = chat?.llm_provider_id;
    if (fromChat && list.some((p) => p.id === fromChat)) return fromChat;
    const def = list.find((p) => p.is_default);
    return def?.id || list[0]?.id || "";
  }, [providers, chat?.llm_provider_id]);

  useEffect(() => {
    if (!open) return undefined;
    setActiveProviderId(initialProviderId);
    setQuery("");
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, initialProviderId]);

  const activeProvider = useMemo(
    () => (providers || []).find((p) => p.id === activeProviderId),
    [providers, activeProviderId],
  );

  const filteredModels = useMemo(() => {
    const models = activeProvider?.models || [];
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [activeProvider, query]);

  // Hide entirely when the user has no providers (server fallback is used).
  if (!providers || providers.length === 0) return null;

  const hasSelection =
    chat?.llm_provider_id != null && chat.llm_provider_id !== "";

  const currentLabel = hasSelection
    ? chat.llm_model ||
      providers.find((p) => p.id === chat.llm_provider_id)?.name ||
      "Custom"
    : "Default model";

  const pickModel = (model) => {
    setOpen(false);
    onChange({
      llm_provider_id: activeProviderId,
      llm_model: model,
    });
  };

  const pickDefault = () => {
    setOpen(false);
    onChange({ llm_provider_id: "", llm_model: "" });
  };

  const isActiveModel = (model) =>
    hasSelection &&
    chat.llm_provider_id === activeProviderId &&
    (chat.llm_model || "") === model;

  const isDefaultActive = !hasSelection;

  return (
    <div className="chat-model" ref={rootRef}>
      <button
        type="button"
        className={`chat-composer-chip${open ? " is-open" : ""}${hasSelection ? " is-on" : ""}`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Model for this chat"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Cpu size={12.5} strokeWidth={2.2} aria-hidden />
        <span className="chat-model__label">{currentLabel}</span>
        <ChevronDown size={12} strokeWidth={2.2} className="chat-model__chevron" aria-hidden />
      </button>

      {open && (
        <div className="chat-model__menu" role="listbox" aria-label="Model for this chat">
          <div className="chat-model__head">
            {providers.length > 1 && (
              <div className="chat-model__providers" role="tablist" aria-label="Provider">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={p.id === activeProviderId}
                    className={`chat-model__provider${p.id === activeProviderId ? " is-active" : ""}`}
                    onClick={() => {
                      setActiveProviderId(p.id);
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                  >
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="chat-model__search">
              <Search size={13} className="chat-model__search-icon" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                className="chat-model__search-input"
                placeholder="Search models…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="chat-model__list">
            <button
              type="button"
              className={`chat-model__item${isDefaultActive ? " is-active" : ""}`}
              role="option"
              aria-selected={isDefaultActive}
              onClick={pickDefault}
            >
              <span className="truncate">Default model</span>
              {isDefaultActive && <Check size={13} strokeWidth={2.4} aria-hidden />}
            </button>

            {filteredModels.length > 0 ? (
              filteredModels.map((m) => {
                const active = isActiveModel(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`chat-model__item${active ? " is-active" : ""}`}
                    role="option"
                    aria-selected={active}
                    onClick={() => pickModel(m)}
                  >
                    <span className="truncate">{m}</span>
                    {active && <Check size={13} strokeWidth={2.4} aria-hidden />}
                  </button>
                );
              })
            ) : (
              <div className="chat-model__empty">
                {query.trim() ? "No models match your search" : "No models from this provider"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

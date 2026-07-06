import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  Plus,
  Send,
  Square,
  ArrowDown,
  Globe,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import MessageContent from "../components/MessageContent";
import DatasetPicker from "../components/DatasetPicker";
import ModelPicker from "../components/ModelPicker";
import { createChat, getChat, patchChat } from "../api/chats";
import { useModuleBase, useModuleId } from "../hooks/useModuleBase";
import { chatStream } from "../services/chatStream";

const RAIL_INTRO_FLAG = "aerith.analyticsRailIntro";
const RAIL_INTRO_WAS_COLLAPSED = "aerith.analyticsRailIntroWasCollapsed";
const RAIL_INTRO_LEG_MS = 300;
const LG_MEDIA_QUERY = "(min-width: 1024px)";

function AssistantLabel() {
  return <div className="msg-label">AERITH</div>;
}

function formatMessageStatus(st) {
  const map = {
    complete: "complete",
    pending: "pending",
    streaming: "streaming",
    error: "error",
    cancelled: "cancelled",
  };
  return map[st] || st;
}

function humanThinkingHint(t) {
  if (!t) return null;
  switch (t.type) {
    case "plan":
      return `Planning · ${t.subtasks?.length || 0} steps`;
    case "subagent_start":
      return `Starting subtask · ${t.name || t.source_id || ""}`.trim();
    case "subagent_tool":
      return `Running tool · ${t.tool}`;
    case "subagent_result":
      return `Got result · ${t.tool}`;
    case "subagent_done":
      return `Subtask complete · ${t.source_id || ""}`.trim();
    case "merge_start":
      return "Merging results";
    case "tool_call":
      return `Calling tool · ${t.tool}`;
    case "tool_result":
      return `Received data · ${t.tool}`;
    default:
      return null;
  }
}

function ThinkingBubble({ tech }) {
  const last = Array.isArray(tech) && tech.length ? tech[tech.length - 1] : null;
  const hint = humanThinkingHint(last);
  return (
    <div className="msg-thinking-in msg msg-assistant">
      <AssistantLabel />
      <div className="panel msg-bubble msg-bubble-assistant msg-thinking p-4">
        <div className="thinking">
          <div className="thinking-row">
            <span className="thinking-orb" aria-hidden>
              <span className="orb-halo" />
              <span className="orb-ring" />
              <span className="orb-core" />
              <span className="orb-orbit orb-orbit--a"><i /></span>
              <span className="orb-orbit orb-orbit--b"><i /></span>
              <span className="orb-orbit orb-orbit--c"><i /></span>
            </span>
            <span className="thinking-hint" key={hint || "idle"}>
              {hint || "Thinking…"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const moduleBase = useModuleBase();
  const moduleId = useModuleId();
  const outletCtx = useOutletContext?.() || {};
  const refreshChats = outletCtx.refreshChats || (() => {});
  const [chat, setChat] = useState(null);
  const [input, setInput] = useState("");
  const [stream, setStream] = useState(() => chatStream.getState(chatId || ""));
  const [linkedCount, setLinkedCount] = useState(0);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const composerRef = useRef(null);
  const datasetPickerRef = useRef(null);
  const settledIdsRef = useRef(new Set());

  // Messages scroll behind the glass composer; keep enough bottom padding so
  // the last message can rise fully above it (input grows up to 5 lines).
  useEffect(() => {
    const composer = composerRef.current;
    const scroller = scrollRef.current;
    if (!composer || !scroller) return undefined;
    const ro = new ResizeObserver(() => {
      scroller.style.setProperty("--composer-h", `${composer.offsetHeight}px`);
    });
    ro.observe(composer);
    return () => ro.disconnect();
  }, [chat]);

  const [railCollapsed, setRailCollapsed] = useState(() => {
    try {
      return localStorage.getItem("aerith.railCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [railEnterPhase, setRailEnterPhase] = useState(null);
  const introWasCollapsedRef = useRef(false);

  const [railExitClosing, setRailExitClosing] = useState(false);
  const [railExitToZero, setRailExitToZero] = useState(false);
  const railExitClosingRef = useRef(false);

  const toggleRail = () => {
    setRailExitClosing(false);
    setRailExitToZero(false);
    railExitClosingRef.current = false;
    setRailEnterPhase(null);
    setRailCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("aerith.railCollapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  useEffect(() => {
    settledIdsRef.current = new Set();
    setRailEnterPhase(null);
    setRailExitClosing(false);
    setRailExitToZero(false);
    railExitClosingRef.current = false;
    if (!chatId) {
      setChat(null);
      setStream(chatStream.getState(""));
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const c = await getChat(chatId);
        if (cancelled) return;
        if (c.module_id && c.module_id !== moduleId) {
          navigate(moduleBase, { replace: true });
          return;
        }
        setChat(c);
      } catch {
        if (!cancelled) setChat(null);
      }
    })();
    const unsub = chatStream.subscribe(chatId, (st) => {
      setStream(st);
      if (st.chatTitle) {
        setChat((prev) => (prev ? { ...prev, title: st.chatTitle } : prev));
        refreshChats();
      }
    });
    const unsubFinish = chatStream.onFinish(chatId, async () => {
      try {
        const c = await getChat(chatId);
        const lastAssistant = [...(c?.messages || [])]
          .reverse()
          .find((m) => m.role === "assistant");
        if (lastAssistant) settledIdsRef.current.add(lastAssistant.id);
        setChat(c);
        refreshChats();
      } catch {}
      chatStream.reset(chatId);
    });
    return () => {
      cancelled = true;
      unsub();
      unsubFinish();
    };
  }, [chatId, moduleId, moduleBase, navigate]);

  const [atBottom, setAtBottom] = useState(true);
  const syncInputHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")) return;

    const style = el.style;
    style.minHeight = "0";
    style.height = "0";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 21;
    const maxHeight = lineHeight * 5;
    const next = Math.min(el.scrollHeight, maxHeight);
    style.height = `${Math.max(lineHeight, next)}px`;
    style.minHeight = "";
    style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    syncInputHeight();
  }, [input, syncInputHeight]);

  const onScrollCheck = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(dist < 80);
  }, []);
  useEffect(() => {
    onScrollCheck();
  }, [chat?.messages?.length, stream.buffer, onScrollCheck]);

  useEffect(() => {
    if (chat?.chat_mode !== "analytics") setRailEnterPhase(null);
  }, [chat?.chat_mode]);

  useLayoutEffect(() => {
    if (chat?.chat_mode !== "analytics" || !chatId) return;
    let play = false;
    try {
      play = sessionStorage.getItem(RAIL_INTRO_FLAG) === "1";
    } catch {
      return;
    }
    if (!play) return;
    let wasCollapsed = false;
    try {
      wasCollapsed = sessionStorage.getItem(RAIL_INTRO_WAS_COLLAPSED) === "1";
    } catch {
      wasCollapsed = false;
    }
    introWasCollapsedRef.current = wasCollapsed;
    setRailEnterPhase(0);
  }, [chat?.chat_mode, chatId]);

  useLayoutEffect(() => {
    if (railEnterPhase !== 0) return undefined;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          sessionStorage.removeItem(RAIL_INTRO_FLAG);
          sessionStorage.removeItem(RAIL_INTRO_WAS_COLLAPSED);
        } catch {}
        setRailEnterPhase(1);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [railEnterPhase]);

  useLayoutEffect(() => {
    if (!railExitClosing) {
      setRailExitToZero(false);
      return undefined;
    }
    setRailExitToZero(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setRailExitToZero(true));
    });
    return () => cancelAnimationFrame(id);
  }, [railExitClosing]);

  useEffect(() => {
    if (!railExitClosing || !railExitToZero || !chatId) return undefined;
    const t = window.setTimeout(async () => {
      try {
        const updated = await patchChat(chatId, { chat_mode: "chat" });
        setChat(updated);
      } catch {}
      railExitClosingRef.current = false;
      setRailExitClosing(false);
      setRailExitToZero(false);
    }, RAIL_INTRO_LEG_MS);
    return () => clearTimeout(t);
  }, [railExitClosing, railExitToZero, chatId]);

  useEffect(() => {
    if (railEnterPhase !== 1) return undefined;
    const collapsed = introWasCollapsedRef.current;
    const t = window.setTimeout(() => {
      if (collapsed) {
        try {
          localStorage.setItem("aerith.railCollapsed", "0");
        } catch {}
        setRailCollapsed(false);
        setRailEnterPhase(2);
      } else {
        setRailEnterPhase(null);
      }
    }, RAIL_INTRO_LEG_MS);
    return () => clearTimeout(t);
  }, [railEnterPhase]);

  useEffect(() => {
    if (railEnterPhase !== 2) return undefined;
    const t = window.setTimeout(() => setRailEnterPhase(null), RAIL_INTRO_LEG_MS);
    return () => clearTimeout(t);
  }, [railEnterPhase]);

  // Stable callback so memoized history messages don't re-render while streaming.
  const onSuggestionPick = useCallback((q) => setInput(q), []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const onNewChat = async () => {
    const c = await createChat({ module_id: moduleId });
    refreshChats();
    navigate(`${moduleBase}/chat/${c.id}`);
  };

  const onSend = () => {
    const text = input.trim();
    if (!text || !chatId || stream.status === "streaming") return;
    setInput("");
    chatStream.start(chatId, text);
  };

  const onCancel = () => {
    if (chatId) chatStream.cancel(chatId);
  };

  const setChatMode = async (mode) => {
    if (!chat || !chatId) return;
    if (mode === "analytics") {
      setRailExitClosing(false);
      setRailExitToZero(false);
      railExitClosingRef.current = false;
    }
    if (mode === "chat" && chat.chat_mode === "analytics") {
      if (railExitClosingRef.current) return;
      const wide =
        typeof window !== "undefined" && window.matchMedia(LG_MEDIA_QUERY).matches;
      if (wide) {
        railExitClosingRef.current = true;
        setRailEnterPhase(null);
        try {
          sessionStorage.removeItem(RAIL_INTRO_FLAG);
          sessionStorage.removeItem(RAIL_INTRO_WAS_COLLAPSED);
        } catch {}
        setRailExitClosing(true);
        setRailExitToZero(false);
        return;
      }
    }
    if (chat.chat_mode === mode) return;
    if (mode === "analytics") {
      try {
        sessionStorage.setItem(RAIL_INTRO_FLAG, "1");
        sessionStorage.setItem(RAIL_INTRO_WAS_COLLAPSED, railCollapsed ? "1" : "0");
      } catch {}
    }
    const payload = { chat_mode: mode };
    if (mode === "analytics") payload.analytics_charts_enabled = true;
    try {
      const updated = await patchChat(chatId, payload);
      setChat(updated);
    } catch {
      if (mode === "analytics") {
        try {
          sessionStorage.removeItem(RAIL_INTRO_FLAG);
          sessionStorage.removeItem(RAIL_INTRO_WAS_COLLAPSED);
        } catch {}
      }
    }
  };

  const toggleWebSearch = async () => {
    if (!chat || !chatId) return;
    const prev = !!chat.web_search_enabled;
    const next = !prev;
    setChat({ ...chat, web_search_enabled: next });
    try {
      const updated = await patchChat(chatId, { web_search_enabled: next });
      setChat(updated);
    } catch {
      setChat({ ...chat, web_search_enabled: prev });
    }
  };

  const onModelChange = async (payload) => {
    if (!chat || !chatId) return;
    try {
      const updated = await patchChat(chatId, payload);
      setChat(updated);
    } catch {}
  };

  const activelyStreaming = stream.status === "streaming";
  const optimisticUser = activelyStreaming ? stream.optimisticUser : null;

  const datasetActivity = (() => {
    const map = {};
    let single = null;
    for (const ev of stream.tech || []) {
      if (ev.type === "subagent_start" && ev.source_id) {
        map[ev.source_id] = { status: "active", tool: null };
      } else if (ev.type === "subagent_tool" && ev.source_id) {
        map[ev.source_id] = { status: "active", tool: ev.tool || null };
      } else if (ev.type === "subagent_result" && ev.source_id) {
        const cur = map[ev.source_id] || { status: "active", tool: null };
        map[ev.source_id] = { ...cur, status: "active" };
      } else if (ev.type === "subagent_done" && ev.source_id) {
        map[ev.source_id] = { status: ev.error ? "error" : "done", tool: null };
      } else if (ev.type === "subagent_error" && ev.source_id) {
        map[ev.source_id] = { status: "error", tool: null };
      } else if (ev.type === "tool_call") {
        single = { status: "active", tool: ev.tool || null };
      } else if (ev.type === "tool_result") {
        single = { status: "active", tool: ev.tool || null };
      }
    }
    if (!activelyStreaming && single?.status === "active") single = { status: "done", tool: null };
    if (!activelyStreaming) {
      for (const k of Object.keys(map)) {
        if (map[k]?.status === "active") map[k] = { status: "done", tool: null };
      }
    }
    return { map, single };
  })();
  const hasPersistedOptimistic =
    optimisticUser &&
    (chat?.messages || [])
      .slice(-1)
      .some((m) => m.role === "user" && m.content === optimisticUser);
  const showOptimisticUser = optimisticUser && !hasPersistedOptimistic;

  const railEnterActive = railEnterPhase !== null;
  const railExitActive = railExitClosing;
  const railWidthClass = (() => {
    if (railExitClosing) {
      return railExitToZero
        ? "w-0 min-w-0 overflow-x-hidden"
        : railCollapsed
          ? "w-14"
          : "w-72";
    }
    if (railEnterPhase === 0) return "w-0 min-w-0 overflow-x-hidden";
    if (railEnterPhase === 1)
      return introWasCollapsedRef.current ? "w-14" : "w-72";
    if (railEnterPhase === 2) return "w-72";
    return railCollapsed ? "w-14" : "w-72";
  })();
  const effectiveRailCollapsed = (() => {
    if (railExitClosing && railExitToZero) return true;
    if (railExitClosing && !railExitToZero) return railCollapsed;
    if (railEnterActive && introWasCollapsedRef.current) return railEnterPhase !== 2;
    return railCollapsed;
  })();

  const chatToolbar = chat ? (
    <>
      <input
        className="input flex-1 min-w-[180px]"
        value={chat.title}
        onChange={(e) => setChat({ ...chat, title: e.target.value })}
        onBlur={async () => {
          const updated = await patchChat(chatId, { title: chat.title });
          setChat(updated);
          refreshChats();
        }}
        style={{ background: "transparent", border: "none", padding: "0.3rem 0" }}
      />
      <div className="chat-mode-switch" role="radiogroup" aria-label="Chat mode">
        <button
          type="button"
          role="radio"
          aria-checked={chat.chat_mode === "chat" || railExitClosing}
          className={chat.chat_mode === "chat" || railExitClosing ? "is-active" : ""}
          onClick={() => setChatMode("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={chat.chat_mode === "analytics" && !railExitClosing}
          className={chat.chat_mode === "analytics" && !railExitClosing ? "is-active" : ""}
          onClick={() => setChatMode("analytics")}
        >
          Analytics
        </button>
      </div>
    </>
  ) : null;

  const webSearchChip = chat ? (
    <button
      type="button"
      role="switch"
      aria-checked={!!chat.web_search_enabled}
      className={`chat-composer-chip${chat.web_search_enabled ? " is-on" : ""}`}
      onClick={toggleWebSearch}
      disabled={activelyStreaming}
      title={
        chat.web_search_enabled
          ? "Web search on — answers use live data from the web"
          : "Enable web search"
      }
      aria-label={chat.web_search_enabled ? "Web search on" : "Enable web search"}
    >
      <Globe size={12.5} strokeWidth={2.2} aria-hidden />
      <span>Web search</span>
    </button>
  ) : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="chat-topbar flex shrink-0 items-stretch px-5 py-3 gap-3 flex-wrap">
        <button
          type="button"
          className="btn btn-primary rounded-full shrink-0"
          onClick={onNewChat}
          title="New chat"
          aria-label="New chat"
          style={{ width: "2.5rem", height: "2.5rem", padding: 0 }}
        >
          <Plus size={18} strokeWidth={2.25} />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">{chatToolbar}</div>
      </div>

      <div className="flex flex-1 min-h-0 min-w-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {!chat ? (
            <div className="flex-1 flex items-center justify-center text-muted p-6">
              Loading…
            </div>
          ) : (
            <>
              <div className="chat-messages-pane">
                <div
                  className="chat-scroll h-full overflow-auto scroll-invisible"
                  ref={scrollRef}
                  onScroll={onScrollCheck}
                >
                  <div className="max-w-3xl mx-auto flex flex-col gap-4">
                    {(chat.messages || []).map((m) => {
                      const isJustSent =
                        m.role === "user" && optimisticUser && m.content === optimisticUser;
                      const alreadySettled = settledIdsRef.current.has(m.id);
                      const shouldAnimate = !alreadySettled && !isJustSent;
                      if (isJustSent || !alreadySettled) settledIdsRef.current.add(m.id);
                      return (
                      <div key={m.id} className={`${shouldAnimate ? "message-row-in" : ""} msg msg-${m.role}`}>
                        {m.role === "assistant" ? (
                          <AssistantLabel />
                        ) : (
                          <div className="msg-label">You</div>
                        )}
                        <div
                          className={`panel msg-bubble msg-bubble-${m.role} p-4`}
                          style={
                            m.role === "assistant" && m.status === "error"
                              ? { borderColor: "rgba(244, 63, 94, 0.35)" }
                              : undefined
                          }
                        >
                          <MessageContent
                            content={m.content}
                            role={m.role}
                            onSuggestionPick={onSuggestionPick}
                            citations={m.annotations}
                          />
                          {m.status && m.status !== "complete" && m.status !== "error" && (
                            <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                              [{formatMessageStatus(m.status)}]
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                    {showOptimisticUser && (
                      <div className="msg-send-in msg msg-user">
                        <div className="msg-label">You</div>
                        <div className="panel msg-bubble msg-bubble-user p-4">
                          <MessageContent content={optimisticUser} role="user" />
                        </div>
                      </div>
                    )}
                    {stream.buffer && (
                      <div className="message-row-in msg msg-assistant">
                        <AssistantLabel />
                        <div className="panel msg-bubble msg-bubble-assistant p-4">
                          <MessageContent
                            content={stream.buffer}
                            role="assistant"
                            citations={stream.citations}
                          />
                        </div>
                      </div>
                    )}
                    {!stream.buffer && activelyStreaming && (
                      <ThinkingBubble tech={stream.tech} />
                    )}
                    {stream.error && (
                      <div className="panel p-3 text-sm" style={{ color: "var(--danger)" }}>
                        {stream.error}
                      </div>
                    )}
                  </div>
                </div>

                <div className="chat-composer chat-composer--overlay" ref={composerRef}>
                  <div className="chat-composer__inner">
                    {!atBottom && (
                      <button
                        type="button"
                        onClick={scrollToBottom}
                        title="Jump to latest message"
                        aria-label="Jump to latest message"
                        className="chat-scroll-down focus-ring-neutral"
                      >
                        <ArrowDown size={18} strokeWidth={2.25} />
                      </button>
                    )}
                    <div className="chat-composer__box">
                    <div className="chat-composer__input-scroll">
                    <textarea
                      ref={inputRef}
                      className="chat-composer__input"
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={
                        activelyStreaming
                          ? "Response in progress — cancel to send a new message…"
                          : "Ask AERITH anything…"
                      }
                      disabled={activelyStreaming}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onSend();
                        }
                      }}
                    />
                    </div>
                    <div className="chat-composer__bottom">
                      <div className="chat-composer__tools">
                        <ModelPicker
                          chat={chat}
                          disabled={activelyStreaming}
                          onChange={onModelChange}
                        />
                        {webSearchChip}
                      </div>
                      {activelyStreaming ? (
                        <button
                          type="button"
                          className="chat-composer__send chat-composer__send--stop"
                          onClick={onCancel}
                          title="Cancel"
                          aria-label="Cancel response"
                        >
                          <Square size={15} strokeWidth={2.25} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="chat-composer__send"
                          onClick={onSend}
                          disabled={!input.trim()}
                          title="Send"
                          aria-label="Send message"
                        >
                          <Send size={16} strokeWidth={2.25} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </>
          )}
        </div>

        {chat && (chat.chat_mode === "analytics" || railExitClosing) && (
          <div
            className={`chat-rail ${railWidthClass} flex-shrink-0 overflow-auto hidden lg:flex flex-col transition-[width] ease-out ${
              railEnterActive || railExitActive ? "duration-300" : "duration-200"
            }`}
          >
            <div
              className={`flex items-center shrink-0 ${
                effectiveRailCollapsed ? "justify-center px-0 py-2" : "justify-between px-3 py-2"
              }`}
            >
              {!effectiveRailCollapsed && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] truncate">
                    Datasets
                  </span>
                  <button
                    type="button"
                    className="focus-ring-neutral inline-flex items-center justify-center rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-raised)] hover:text-[var(--accent)]"
                    onClick={() => datasetPickerRef.current?.openModal()}
                    title="Add dataset"
                    aria-label="Add dataset"
                  >
                    <Plus size={14} strokeWidth={2.25} />
                  </button>
                </div>
              )}
              <button
                type="button"
                className="focus-ring-neutral inline-flex items-center justify-center rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-raised)] hover:text-[var(--text-primary)]"
                onClick={toggleRail}
                title={effectiveRailCollapsed ? "Expand panel" : "Collapse panel"}
                aria-label={effectiveRailCollapsed ? "Expand panel" : "Collapse panel"}
              >
                {effectiveRailCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
              </button>
            </div>
            <div className={`flex-1 min-h-0 overflow-auto ${effectiveRailCollapsed ? "" : "p-3"}`}>
              <DatasetPicker
                ref={datasetPickerRef}
                chatId={chatId}
                onChange={(l) => setLinkedCount(l.length)}
                activity={datasetActivity.map}
                singleActivity={datasetActivity.single}
                isStreaming={activelyStreaming}
                collapsed={effectiveRailCollapsed}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

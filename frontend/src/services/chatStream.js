import { apiBase } from "../api/client";

const TECH_TYPES = new Set([
  "plan",
  "subagent_start",
  "subagent_tool",
  "subagent_result",
  "subagent_done",
  "merge_start",
  "tool_call",
  "tool_result",
]);

function emptyState() {
  return {
    status: "idle",
    buffer: "",
    tech: [],
    citations: [],
    chatTitle: null,
    error: null,
    optimisticUser: null,
  };
}

class ChatStreamManager {
  constructor() {
    this.streams = new Map();
  }

  _getOrCreate(chatId) {
    let s = this.streams.get(chatId);
    if (s) return s;
    s = {
      state: emptyState(),
      abort: null,
      subs: new Set(),
      finishSubs: new Set(),
    };
    this.streams.set(chatId, s);
    return s;
  }

  _emit(chatId) {
    const s = this.streams.get(chatId);
    if (!s) return;
    for (const cb of s.subs) {
      try {
        cb(s.state);
      } catch {}
    }
  }

  _emitFinish(chatId) {
    const s = this.streams.get(chatId);
    if (!s) return;
    for (const cb of Array.from(s.finishSubs)) {
      try {
        cb(s.state);
      } catch {}
    }
  }

  getState(chatId) {
    return this.streams.get(chatId)?.state || emptyState();
  }

  isActive(chatId) {
    return this.getState(chatId).status === "streaming";
  }

  subscribe(chatId, cb) {
    const s = this._getOrCreate(chatId);
    s.subs.add(cb);
    cb(s.state);
    return () => {
      s.subs.delete(cb);
    };
  }

  onFinish(chatId, cb) {
    const s = this._getOrCreate(chatId);
    s.finishSubs.add(cb);
    return () => {
      s.finishSubs.delete(cb);
    };
  }

  reset(chatId) {
    const s = this.streams.get(chatId);
    if (!s) return;
    if (s.state.status === "streaming") return;
    s.state = emptyState();
    this._emit(chatId);
  }

  async start(chatId, content) {
    const s = this._getOrCreate(chatId);
    if (s.state.status === "streaming") return;

    const ctrl = new AbortController();
    s.abort = ctrl;
    s.state = {
      status: "streaming",
      buffer: "",
      tech: [],
      citations: [],
      error: null,
      optimisticUser: content,
    };
    this._emit(chatId);

    try {
      await streamChatMessage(
        chatId,
        content,
        (ev) => {
          if (ev.type === "delta") {
            s.state = { ...s.state, buffer: s.state.buffer + (ev.delta || "") };
            this._emit(chatId);
          } else if (TECH_TYPES.has(ev.type)) {
            s.state = { ...s.state, tech: [...s.state.tech, ev] };
            this._emit(chatId);
          } else if (ev.type === "citations") {
            s.state = { ...s.state, citations: ev.citations || [] };
            this._emit(chatId);
          } else if (ev.type === "error") {
            s.state = { ...s.state, error: ev.detail || "Error" };
            this._emit(chatId);
          } else if (ev.type === "title") {
            s.state = { ...s.state, chatTitle: ev.title || null };
            this._emit(chatId);
          } else if (ev.type === "done") {
            if (ev.citations?.length) {
              s.state = { ...s.state, citations: ev.citations };
            }
            if (ev.title) {
              s.state = { ...s.state, chatTitle: ev.title };
            }
            if (ev.error) {
              s.state = { ...s.state, error: s.state.error || ev.error };
            }
            this._emit(chatId);
          }
        },
        ctrl.signal,
      );
      s.state = {
        ...s.state,
        status: s.state.error ? "error" : "done",
      };
    } catch (err) {
      if (err?.name === "AbortError") {
        s.state = { ...s.state, status: "cancelled" };
      } else {
        s.state = {
          ...s.state,
          status: "error",
          error: s.state.error || err?.message || "Error",
        };
      }
    } finally {
      s.abort = null;
      this._emit(chatId);
      this._emitFinish(chatId);
    }
  }

  cancel(chatId) {
    const s = this.streams.get(chatId);
    if (s?.abort) s.abort.abort();
  }
}

export const chatStream = new ChatStreamManager();

async function streamChatMessage(chatId, content, onEvent, signal) {
  const res = await fetch(`${apiBase()}/chats/${chatId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {}
    throw new Error(detail);
  }
  if (!res.body) throw new Error("Stream not supported");

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (signal?.aborted) return;
      throw err;
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    let sepIdx;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      const dataLines = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart());
      if (dataLines.length === 0) continue;
      const payload = dataLines.join("\n");
      try {
        onEvent(JSON.parse(payload));
      } catch {}
    }
  }
}

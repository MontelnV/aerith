# Integrating with AERITH

This guide covers the three extension points of AERITH:

1. [Connecting your own OpenAI-compatible API](#1-connect-an-openai-compatible-api)
2. [Bringing your own data](#2-bring-your-own-data)
3. [Adding a new workspace module](#3-add-a-workspace-module)

---

## 1. Connect an OpenAI-compatible API

AERITH speaks the OpenAI Chat Completions protocol, so any compatible endpoint
works: OpenAI, OpenRouter, Azure OpenAI, AITunnel, or a local vLLM / Ollama /
LM Studio server.

### Per-user providers (recommended)

Each user manages their own providers in **Settings → AI providers**:

- **Name** — display name (e.g. "OpenRouter").
- **Base URL** — e.g. `https://openrouter.ai/api/v1` or `http://localhost:11434/v1`.
- **API key** — stored encrypted (Fernet) in the app database.

The model list is discovered automatically: saving a provider queries its
`/models` endpoint (which also validates the URL and key), and the refresh
button re-fetches the list at any time.

One provider is marked **default** and is used for new chats. Inside any chat,
the model selector in the composer switches provider/model for that chat only
(persisted per chat).

Resolution order for every request:

```
chat's provider  →  user's default provider  →  server-wide LLM__* fallback
```

### Server-wide fallback

The administrator can define one instance-wide provider in `.env`:

```bash
LLM__API_KEY=sk-...
LLM__BASE_URL=https://api.openai.com/v1
LLM__DEFAULT_MODEL=gpt-4o-mini
```

It is used for users who have not registered any provider of their own.

### REST API

Everything the UI does is available over REST (cookie-authenticated):

| Method & path | Purpose |
|---|---|
| `GET /api/llm/providers` | List your providers (keys masked) |
| `POST /api/llm/providers` | Create: `{name, base_url, api_key, is_default}`; models are auto-discovered |
| `PATCH /api/llm/providers/{id}` | Update fields; changing URL/key re-fetches models |
| `DELETE /api/llm/providers/{id}` | Delete |
| `POST /api/llm/providers/{id}/refresh-models` | Re-fetch the provider's `/models` list |
| `PATCH /api/chats/{id}` | Set `{llm_provider_id, llm_model}` for a chat |

---

## 2. Bring your own data

Analytics chats operate on **dataset connections**. There are two kinds:

### Uploaded files (CSV / XLSX)

Upload via **My datasets → Upload**. The file is ingested into a per-user
schema in the dedicated datasets Postgres, column types are inferred, and the
dataset becomes linkable to analytics chats. Limits are configurable
(`DATASETS__MAX_UPLOAD_MB`, `DATASETS__MAX_PER_USER`).

### External Postgres

Add a connection with host / port / database / user / password / SSL mode.
The password is encrypted at rest (`AUTH__DATA_KEY` or a key derived from
`AUTH__JWT_SECRET`). AERITH only ever runs **read-only** statements against
external databases: queries are validated to be a single `SELECT` / `WITH`
statement with a forbidden-keyword guard
(see `src/aerith/instruments/analytics_db.py`).

### How agents see your data

When a chat runs in analytics mode, each linked dataset gets its own agent
with four SQL tools bound to that one connection
(`src/aerith/instruments/analytics_tools.py`):

- `list_tables` — enumerate tables/schemas,
- `describe_table` — column names and types,
- `sample_rows` — peek at up to N rows,
- `run_select_query` — run one read-only query.

With one dataset a single agent answers directly; with several, a planner
model splits the question into subtasks, sub-agents work in parallel (one per
dataset), and a lead model merges their findings into the final streamed
answer (`src/aerith/services/analytics_swarm.py`).

### Sharing

Set a dataset's visibility to **public** to publish it in the marketplace,
where other users can link it to their chats.

---

## 3. Add a workspace module

Modules are top-level workspaces (like the built-in **Analytics**) with their
own navigation, routes and chats.

### Frontend

1. Register the module in `frontend/src/modules/_config.js`:

```js
export const MODULES = [
  // ...existing analytics module...
  {
    id: "mymodule",
    label: "My module",
    railLabel: "MYMOD",
    short: "MM",
    icon: SomeLucideIcon,
    accent: "#a78bfa",
    description: "What this workspace does",
    nav: [
      { to: "", label: "Chat", icon: Sparkles,
        matches: (rest) => rest === "" || rest.startsWith("chat/") },
      // more nav items...
    ],
  },
];
```

2. Create a layout (copy `frontend/src/modules/analytics/Layout.jsx` as a
   starting point) and add routes in `frontend/src/App.jsx`:

```jsx
<Route path="/m/mymodule" element={<MyModuleLayout />}>
  <Route index element={<ModuleWelcomePage />} />
  <Route path="chat/:chatId" element={<ChatPage />} />
</Route>
```

The `useModuleBase` / `useModuleId` hooks resolve the current module from the
URL, so shared pages (like `ChatPage`) work inside any module unchanged.

3. Optionally add welcome content in `frontend/src/modules/welcomeContent.js`.

### Backend

Chats carry a `module_id`, validated against an allow-list in
`src/aerith/routers/chats.py`:

```python
CHAT_MODULE_IDS = frozenset({"analytics"})
```

Add your module id there. Chat listing supports filtering by module
(`GET /api/chats?module_id=mymodule`), so each module gets its own chat
history. Module-specific backend behaviour (custom tools, prompts, data
sources) can branch on `chat.module_id` in
`src/aerith/services/chat_runtime.py`.

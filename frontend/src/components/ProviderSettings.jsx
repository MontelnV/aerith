import { useEffect, useState } from "react";
import { Bot, Pencil, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import {
  createProvider,
  deleteProvider,
  listProviders,
  patchProvider,
  refreshProviderModels,
} from "../api/llm";

const EMPTY_FORM = { name: "", base_url: "", api_key: "" };

function ProviderForm({ initial, onSave, onCancel, saving, isEdit }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={set("name")} placeholder="OpenRouter" required />
        </div>
        <div>
          <label className="label">Base URL</label>
          <input className="input" value={form.base_url} onChange={set("base_url")} placeholder="https://openrouter.ai/api/v1" required />
        </div>
      </div>
      <div>
        <label className="label">
          API key{isEdit ? " · leave blank to keep current" : ""}
        </label>
        <input className="input" type="password" value={form.api_key} onChange={set("api_key")} autoComplete="off" placeholder="sk-…" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? "Checking…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export default function ProviderSettings() {
  const [providers, setProviders] = useState([]);
  const [serverFallback, setServerFallback] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [refreshingId, setRefreshingId] = useState(null);

  const reload = async () => {
    const data = await listProviders();
    setProviders(data.providers || []);
    setServerFallback(data.server_fallback || null);
  };

  useEffect(() => {
    reload().catch((e) => setErr(e.message));
  }, []);

  const withSave = async (fn) => {
    setErr("");
    setSaving(true);
    try {
      await fn();
      await reload();
      setAdding(false);
      setEditingId(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onCreate = (form) =>
    withSave(() =>
      createProvider({
        name: form.name,
        base_url: form.base_url,
        api_key: form.api_key,
      }),
    );

  const onUpdate = (id, form) =>
    withSave(() =>
      patchProvider(id, {
        name: form.name,
        base_url: form.base_url,
        ...(form.api_key ? { api_key: form.api_key } : {}),
      }),
    );

  const onDelete = async (id) => {
    if (!window.confirm("Delete this provider?")) return;
    setErr("");
    try {
      await deleteProvider(id);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  const onMakeDefault = async (id) => {
    setErr("");
    try {
      await patchProvider(id, { is_default: true });
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  const onRefreshModels = async (p) => {
    setErr("");
    setRefreshingId(p.id);
    try {
      await refreshProviderModels(p.id);
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <section className="settings-card">
      <div className="settings-card__head">
        <div className="settings-card__icon" aria-hidden>
          <Bot size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="settings-card__title">AI providers</h2>
          <p className="settings-card__subtitle">
            Any OpenAI-compatible API — models are discovered automatically
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
          >
            <Plus size={14} /> Add
          </button>
        )}
      </div>

      {err && <div className="settings-note settings-note--err">{err}</div>}

      {adding && (
        <div className="settings-card__body">
          <ProviderForm
            initial={EMPTY_FORM}
            saving={saving}
            onSave={onCreate}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {providers.length === 0 && !adding ? (
        <div className="settings-empty">
          <Bot size={22} strokeWidth={1.6} aria-hidden />
          <div className="settings-empty__title">
            {serverFallback?.configured
              ? "Using the server default provider"
              : "No providers connected"}
          </div>
          <div className="settings-empty__hint">
            Add your own key to pick models per chat
          </div>
        </div>
      ) : (
        <div className="settings-list">
          {providers.map((p) =>
            editingId === p.id ? (
              <div key={p.id} className="settings-row settings-row--editing">
                <ProviderForm
                  initial={{ name: p.name, base_url: p.base_url, api_key: "" }}
                  isEdit
                  saving={saving}
                  onSave={(form) => onUpdate(p.id, form)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            ) : (
              <div key={p.id} className="settings-row">
                <div className="min-w-0 flex-1">
                  <div className="settings-row__title">
                    <span className="truncate">{p.name}</span>
                    {p.is_default && <span className="settings-chip">default</span>}
                  </div>
                  <div className="settings-row__meta">
                    <span className="settings-row__url" title={p.base_url}>{p.base_url}</span>
                    <span className="settings-hero__dot" aria-hidden />
                    <span>{p.models?.length || 0} models</span>
                  </div>
                </div>
                <div className="settings-row__actions">
                  {!p.is_default && (
                    <button
                      type="button"
                      className="ds-icon-btn ds-icon-btn--accent"
                      title="Make default"
                      onClick={() => onMakeDefault(p.id)}
                    >
                      <Star size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ds-icon-btn"
                    title="Refresh model list"
                    disabled={refreshingId === p.id}
                    onClick={() => onRefreshModels(p)}
                  >
                    <RefreshCw size={14} className={refreshingId === p.id ? "animate-spin" : ""} />
                  </button>
                  <button
                    type="button"
                    className="ds-icon-btn"
                    title="Edit"
                    onClick={() => {
                      setEditingId(p.id);
                      setAdding(false);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="ds-icon-btn ds-icon-btn--danger"
                    title="Delete"
                    onClick={() => onDelete(p.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

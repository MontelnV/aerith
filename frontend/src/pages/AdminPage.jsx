import { useEffect, useState } from "react";
import { Copy, Plus, Shield, Users, Ticket, Check } from "lucide-react";
import {
  createInvite,
  listInvites,
  listUsers,
  patchUser,
  revokeInvite,
} from "../api/admin";

export default function AdminPage() {
  const [tab, setTab] = useState("users");
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Shield size={20} style={{ color: "var(--accent)" }} />
          <h1 className="text-2xl font-semibold">Administration</h1>
        </div>
        <div className="flex gap-2 mb-4">
          <button className={`btn ${tab === "users" ? "btn-primary" : ""}`} onClick={() => setTab("users")}>
            <Users size={14} /> Users
          </button>
          <button className={`btn ${tab === "invites" ? "btn-primary" : ""}`} onClick={() => setTab("invites")}>
            <Ticket size={14} /> Invites
          </button>
        </div>
        {tab === "users" && <UsersTab />}
        {tab === "invites" && <InvitesTab />}
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");
  const reload = async () => {
    try { setUsers(await listUsers()); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { reload(); }, []);

  const toggleActive = async (u) => {
    try { await patchUser(u.id, { is_active: !u.is_active }); await reload(); } catch (e) { setErr(e.message); }
  };
  const toggleRole = async (u) => {
    try { await patchUser(u.id, { role: u.role === "admin" ? "user" : "admin" }); await reload(); } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      {err && <div className="card mb-3" style={{ color: "var(--danger)" }}>{err}</div>}
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted uppercase" style={{ background: "var(--bg-raised)" }}>
              <th className="text-left px-3 py-2">Login</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Role</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-left px-3 py-2">Last login</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-3 py-2 font-mono text-xs">{u.login}</td>
                <td className="px-3 py-2">{u.display_name}</td>
                <td className="px-3 py-2">
                  <span className={`badge ${u.role === "admin" ? "" : "badge-neutral"}`}>{u.role === "admin" ? "Admin" : "User"}</span>
                </td>
                <td className="px-3 py-2">{u.is_active ? "✓" : "✗"}</td>
                <td className="px-3 py-2 text-muted text-xs">{u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-US") : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button className="btn btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? "Disable" : "Enable"}</button>{" "}
                  <button className="btn btn-sm" onClick={() => toggleRole(u)}>{u.role === "admin" ? "Revoke admin" : "Make admin"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvitesTab() {
  const [invites, setInvites] = useState([]);
  const [note, setNote] = useState("");
  const [ttl, setTtl] = useState(72);
  const [lastToken, setLastToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  const reload = async () => {
    try { setInvites(await listInvites()); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { reload(); }, []);

  const onCreate = async () => {
    setErr("");
    try {
      const r = await createInvite(note, Number(ttl));
      setLastToken(r);
      setNote("");
      await reload();
    } catch (e) { setErr(e.message); }
  };

  const onRevoke = async (id) => {
    await revokeInvite(id);
    await reload();
  };

  return (
    <div>
      <div className="card mb-4">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><Plus size={14} /> New invite</h3>
        <div className="flex gap-2 flex-wrap">
          <input className="input flex-1 min-w-[180px]" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <input className="input w-28" type="number" placeholder="TTL (hours)" value={ttl} onChange={(e) => setTtl(e.target.value)} />
          <button className="btn btn-primary" onClick={onCreate}>Create</button>
        </div>
        {err && <div className="text-sm mt-2" style={{ color: "var(--danger)" }}>{err}</div>}
        {lastToken && (
          <div className="mt-3 panel p-3 text-xs">
            <div className="text-muted mb-1">Invite link (shown once):</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all">{lastToken.invite_link}</code>
              <button
                className="btn btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(lastToken.invite_link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted uppercase" style={{ background: "var(--bg-raised)" }}>
              <th className="text-left px-3 py-2">Note</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Expires</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-3 py-2">{i.note || <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2">
                  <span className={`badge ${i.status === "active" ? "" : "badge-neutral"}`}>
                    {i.status === "active" ? "active" : i.status === "revoked" ? "revoked" : i.status === "expired" ? "expired" : i.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted">{new Date(i.expires_at).toLocaleString("en-US")}</td>
                <td className="px-3 py-2 text-right">
                  {i.status === "active" && <button className="btn btn-sm btn-danger" onClick={() => onRevoke(i.id)}>Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

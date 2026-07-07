import { useEffect, useState } from "react";
import { Shield, Users } from "lucide-react";
import { listUsers, patchUser } from "../api/admin";

export default function AdminPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Shield size={20} style={{ color: "var(--accent)" }} />
          <h1 className="text-2xl font-semibold">Administration</h1>
        </div>
        <div className="flex gap-2 mb-4">
          <button className="btn btn-primary">
            <Users size={14} /> Users
          </button>
        </div>
        <UsersTab />
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

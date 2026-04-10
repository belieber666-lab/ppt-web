"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api-backend";

interface UserItem {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: number;
}

interface TemplateItem {
  id: string;
  name: string;
  filename: string;
  slide_count: number;
  thumbnail_url: string | null;
}

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("ppt_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function AdminPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"templates" | "logos" | "users">("templates");

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white">
      <header className="h-14 flex items-center justify-between px-6
        bg-[#1a1919]/70 border-b border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-5">
          <span className="text-base font-black text-[#cafd00] tracking-widest uppercase select-none">
            PPT Studio
          </span>
          <span className="text-xs text-white/30">管理后台</span>
        </div>
        <button
          onClick={onBack}
          className="text-xs text-[#adaaaa] hover:text-white hover:bg-white/5 px-4 py-1.5 rounded-lg transition"
        >
          ← 返回主页
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-8">
          {([["templates", "模板管理"], ["logos", "公共 Logo"], ["users", "用户管理"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${
                tab === key
                  ? "bg-[#cafd00]/10 text-[#cafd00] border border-[#cafd00]/30"
                  : "text-[#adaaaa] hover:text-white hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "templates" && <TemplateManager />}
        {tab === "logos" && <LogoManager />}
        {tab === "users" && <UserManager />}
      </div>
    </div>
  );
}


/* ── 模板管理 ───────────────────────────────────────────────── */

function TemplateManager() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const [thumbTargetId, setThumbTargetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/templates`, { headers: authHeaders() });
    if (res.ok) setTemplates(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", pendingFile);
    if (uploadName) form.append("name", uploadName);
    try {
      await fetch(`${API_BASE}/api/templates`, {
        method: "POST", body: form, headers: authHeaders(),
      });
      setPendingFile(null);
      setUploadName("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch {}
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此模板？")) return;
    await fetch(`${API_BASE}/api/templates/${id}`, { method: "DELETE", headers: authHeaders() });
    load();
  };

  const handleRename = async (id: string) => {
    const trimmed = nameValue.trim();
    if (!trimmed) { setEditingName(null); return; }
    await fetch(`${API_BASE}/api/templates/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setEditingName(null);
    load();
  };

  const handleThumbUpload = async (file: File) => {
    if (!thumbTargetId) return;
    const form = new FormData();
    form.append("file", file);
    await fetch(`${API_BASE}/api/templates/${thumbTargetId}/thumbnail`, {
      method: "POST", body: form, headers: authHeaders(),
    });
    setThumbTargetId(null);
    load();
  };

  return (
    <div className="space-y-6">
      <input ref={thumbRef} type="file" accept="image/*" className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleThumbUpload(f); if (thumbRef.current) thumbRef.current.value = ""; }} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {templates.map(t => (
          <div key={t.id} className="rounded-xl overflow-hidden ring-1 ring-white/[0.06] group relative">
            <div className="aspect-[16/9] relative cursor-pointer" style={{ background: "#1e293b" }}
              onClick={() => { setThumbTargetId(t.id); thumbRef.current?.click(); }}
              title="点击替换展示图片"
            >
              {t.thumbnail_url ? (
                <img src={`${API_BASE}${t.thumbnail_url}`} alt={t.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">无预览</div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center">
                <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition font-bold">替换图片</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white rounded-full text-xs
                  opacity-0 group-hover:opacity-100 transition flex items-center justify-center hover:bg-[#ff7351]"
              >×</button>
            </div>
            <div className="px-3 py-2 bg-[#1a1919]">
              {editingName === t.id ? (
                <input
                  autoFocus
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onBlur={() => handleRename(t.id)}
                  onKeyDown={e => { if (e.key === "Enter") handleRename(t.id); if (e.key === "Escape") setEditingName(null); }}
                  className="w-full text-sm font-bold text-white bg-white/10 border border-white/20 rounded px-1.5 py-0.5 outline-none"
                />
              ) : (
                <p
                  className="text-sm font-bold text-white/80 truncate cursor-pointer hover:text-[#cafd00] transition"
                  onClick={() => { setEditingName(t.id); setNameValue(t.name); }}
                  title="点击修改名称"
                >{t.name}</p>
              )}
              <p className="text-[10px] text-[#adaaaa]/50">{t.slide_count} 页</p>
            </div>
          </div>
        ))}
      </div>

      <div className="frosted rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">上传新模板</p>
        <label className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed
          border-white/10 bg-white/[0.02] hover:border-white/20 cursor-pointer transition-all">
          <input ref={fileRef} type="file" accept=".pptx,.ppt,.key" className="sr-only"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { setPendingFile(f); if (!uploadName) setUploadName(f.name.replace(/\.[^.]+$/, "")); }
            }} />
          {pendingFile ? (
            <span className="text-sm text-white">{pendingFile.name}</span>
          ) : (
            <span className="text-xs text-[#adaaaa]/60">点击或拖拽 .pptx 文件</span>
          )}
        </label>
        {pendingFile && (
          <div className="flex gap-2">
            <input type="text" value={uploadName} onChange={e => setUploadName(e.target.value)}
              placeholder="模板名称" className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/10
                rounded-lg text-white outline-none" />
            <button onClick={handleUpload} disabled={uploading}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-[#f3ffca] to-[#cafd00]
                text-[#516700] disabled:opacity-40">{uploading ? "上传中" : "上传"}</button>
            <button onClick={() => { setPendingFile(null); setUploadName(""); }}
              className="px-3 py-2 text-xs text-[#adaaaa] hover:text-white rounded-lg">取消</button>
          </div>
        )}
      </div>
    </div>
  );
}


/* ── 用户管理 ───────────────────────────────────────────────── */

function UserManager() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/admin/users`, { headers: authHeaders() });
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newUser || !newPass) return;
    setCreating(true);
    const form = new FormData();
    form.append("username", newUser);
    form.append("password", newPass);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: "POST", body: form, headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        alert(d?.detail || "创建失败");
      } else {
        setNewUser("");
        setNewPass("");
        await load();
      }
    } catch {}
    setCreating(false);
  };

  const handleDelete = async (uid: string, username: string) => {
    if (!confirm(`确定删除用户 "${username}"？`)) return;
    await fetch(`${API_BASE}/api/admin/users/${uid}`, { method: "DELETE", headers: authHeaders() });
    load();
  };

  const handleResetPw = async (uid: string, username: string) => {
    const pw = prompt(`为用户 "${username}" 设置新密码：`);
    if (!pw) return;
    const form = new FormData();
    form.append("password", pw);
    await fetch(`${API_BASE}/api/admin/users/${uid}/password`, {
      method: "PATCH", body: form, headers: authHeaders(),
    });
    alert("密码已重置");
  };

  return (
    <div className="space-y-6">
      <div className="frosted rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-4 py-3 text-[10px] text-[#adaaaa] uppercase tracking-widest font-bold">用户名</th>
              <th className="text-left px-4 py-3 text-[10px] text-[#adaaaa] uppercase tracking-widest font-bold">角色</th>
              <th className="text-right px-4 py-3 text-[10px] text-[#adaaaa] uppercase tracking-widest font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    u.is_admin ? "bg-[#cafd00]/10 text-[#cafd00]" : "bg-white/5 text-[#adaaaa]"
                  }`}>
                    {u.is_admin ? "管理员" : "普通用户"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => handleResetPw(u.id, u.username)}
                    className="text-[10px] text-[#adaaaa] hover:text-white px-2 py-1 rounded hover:bg-white/5 transition">
                    重置密码
                  </button>
                  {!u.is_admin && (
                    <button onClick={() => handleDelete(u.id, u.username)}
                      className="text-[10px] text-[#ff7351] hover:text-white px-2 py-1 rounded hover:bg-[#ff7351]/10 transition">
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="frosted rounded-2xl p-4">
        <p className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest mb-3">新建用户</p>
        <div className="flex gap-2">
          <input type="text" value={newUser} onChange={e => setNewUser(e.target.value)}
            placeholder="用户名" className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/10
              rounded-lg text-white outline-none" />
          <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)}
            placeholder="密码" className="flex-1 px-3 py-2 text-xs bg-white/5 border border-white/10
              rounded-lg text-white outline-none" />
          <button onClick={handleCreate} disabled={creating || !newUser || !newPass}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-[#f3ffca] to-[#cafd00]
              text-[#516700] disabled:opacity-40 transition">{creating ? "创建中" : "创建"}</button>
        </div>
      </div>
    </div>
  );
}


/* ── 公共 Logo 管理 ─────────────────────────────────────────── */

interface LogoItem {
  id: string;
  name: string;
  url: string;
  public?: boolean;
  user_id?: string;
}

function LogoManager() {
  const [logos, setLogos] = useState<LogoItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/logos`, { headers: authHeaders() });
    if (res.ok) setLogos(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("public", "true");
    try {
      await fetch(`${API_BASE}/api/logos`, { method: "POST", body: form, headers: authHeaders() });
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch {}
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此 Logo？")) return;
    await fetch(`${API_BASE}/api/logos/${id}`, { method: "DELETE", headers: authHeaders() });
    load();
  };

  const handleTogglePublic = async (id: string, isPublic: boolean) => {
    await fetch(`${API_BASE}/api/logos/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ public: !isPublic }),
    });
    load();
  };

  const publicLogos = logos.filter(l => l.public);
  const privateLogos = logos.filter(l => !l.public);

  return (
    <div className="space-y-6">
      <p className="text-xs text-[#adaaaa]/60">公共 Logo 对所有用户可见，可在生成 PPT 时选用。</p>

      {publicLogos.length > 0 && (
        <div className="frosted rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-[#cafd00] uppercase tracking-widest">公共 Logo</p>
          <div className="flex flex-wrap gap-3">
            {publicLogos.map(l => (
              <div key={l.id} className="relative group">
                <div className="w-20 h-20 rounded-xl bg-white/5 ring-1 ring-[#cafd00]/20 flex items-center justify-center p-2">
                  <img src={`${API_BASE}${l.url}`} alt={l.name} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => handleTogglePublic(l.id, true)}
                    title="设为私有"
                    className="w-5 h-5 bg-black/70 text-[#adaaaa] hover:text-yellow-400 rounded-full text-[9px] flex items-center justify-center"
                  >🔒</button>
                  <button
                    onClick={() => handleDelete(l.id)}
                    className="w-5 h-5 bg-black/70 text-[#adaaaa] hover:text-[#ff7351] rounded-full text-[9px] flex items-center justify-center"
                  >×</button>
                </div>
                <p className="text-[9px] text-[#adaaaa]/50 text-center mt-1 truncate w-20">{l.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {privateLogos.length > 0 && (
        <div className="frosted rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">我的 Logo（仅自己可见）</p>
          <div className="flex flex-wrap gap-3">
            {privateLogos.map(l => (
              <div key={l.id} className="relative group">
                <div className="w-20 h-20 rounded-xl bg-white/5 ring-1 ring-white/[0.06] flex items-center justify-center p-2">
                  <img src={`${API_BASE}${l.url}`} alt={l.name} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => handleTogglePublic(l.id, false)}
                    title="设为公共"
                    className="w-5 h-5 bg-black/70 text-[#adaaaa] hover:text-[#cafd00] rounded-full text-[9px] flex items-center justify-center"
                  >🌐</button>
                  <button
                    onClick={() => handleDelete(l.id)}
                    className="w-5 h-5 bg-black/70 text-[#adaaaa] hover:text-[#ff7351] rounded-full text-[9px] flex items-center justify-center"
                  >×</button>
                </div>
                <p className="text-[9px] text-[#adaaaa]/50 text-center mt-1 truncate w-20">{l.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="frosted rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-bold text-[#adaaaa] uppercase tracking-widest">上传新公共 Logo</p>
        <label className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed
          border-white/10 bg-white/[0.02] hover:border-white/20 cursor-pointer transition-all">
          <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp" className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          <span className="text-xs text-[#adaaaa]/60">
            {uploading ? "上传中..." : "点击上传 Logo（PNG / SVG / WebP）"}
          </span>
        </label>
      </div>
    </div>
  );
}

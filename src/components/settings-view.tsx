"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLedger } from "./ledger-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminHero, brandEn } from "./brand";
import { SheetAdmin } from "./sheet-admin";

type Listed = { id: string; email: string; name: string; role: string };

const roleLabel: Record<string, string> = { admin: "管理者", editor: "編集", viewer: "閲覧" };

export function SettingsView() {
  const { user, reload } = useLedger();
  const [users, setUsers] = useState<Listed[]>([]);
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [replaceEvents, setReplaceEvents] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "viewer" });

  async function loadUsers() {
    if (user?.role !== "admin") return;
    const response = await fetch("/api/users");
    if (!response.ok) return;
    const body = await response.json();
    setUsers(body.users || []);
  }
  useEffect(() => { void loadUsers(); }, [user?.role]);

  async function logout() {
    await fetch("/api/auth/session", { method: "POST" });
    window.location.href = "/login";
  }

  async function importFile() {
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, replaceEvents }),
    });
    const body = await response.json();
    if (!response.ok) {
      toast.error(body.error || "取り込めませんでした。");
      return;
    }
    toast.success(`取り込みました。現場 ${body.projects}、名簿 ${body.rows}行`);
    await reload();
  }

  async function addUser(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error || "追加できませんでした。");
    toast.success("利用者を追加しました。");
    setForm({ name: "", email: "", password: "", role: "viewer" });
    await loadUsers();
  }

  return (
    <div className={`${brandEn.variable} mx-auto h-full max-w-5xl overflow-auto px-3 py-4 lg:px-6 lg:py-6`}>
      <AdminHero
        kicker="STAFF ADMIN"
        title="設定"
        lead="シートの同期、利用者、原本の取り込み。人と技術で、電気をつなぐ現場の台帳を、ここから整えます。"
      />
      <section className="brand-card mb-4 flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <p className="brand-kicker">SIGNED IN</p>
          <h2 className="mt-1 text-xl font-black">ログイン中</h2>
          <p className="mt-1 text-sm text-white/75">{user?.name}　{roleLabel[user?.role || ""] || "閲覧"}</p>
        </div>
        <Button className="h-11 border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" variant="outline" onClick={logout}>ログアウト</Button>
      </section>
      {user?.role === "admin" && (
        <>
          <SheetAdmin />
          <section className="brand-card mb-4 p-4 sm:p-5">
            <p className="brand-kicker">IMPORT</p>
            <h2 className="mt-1 text-xl font-black">原本の取り込み</h2>
            <p className="mt-1 text-sm text-white/65">現行の state JSON、または「案件,地域,作業員,所属,単位,1,2,…」のCSVを読み込みます。作業員名はサーバーだけに保存されます。</p>
            <input className="mt-3 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#f2c300] file:px-3 file:py-2 file:font-bold file:text-[#0b2545]" type="file" accept="application/json,text/csv,.json,.csv" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setText(await file.text());
            }} />
            {fileName && <p className="mt-2 text-sm">{fileName}　{text.length.toLocaleString()}文字</p>}
            <label className="mt-3 flex items-center gap-2 text-sm"><input className="h-4 w-4 accent-[#ff6a00]" type="checkbox" checked={replaceEvents} onChange={(event) => setReplaceEvents(event.target.checked)} />訂正履歴も置き換える</label>
            <Button className="mt-3 h-11 bg-[#ff6a00] font-black text-black hover:bg-[#ff8a1f]" disabled={!text} onClick={() => void importFile()}>取り込む</Button>
          </section>
          <section id="user-admin" className="brand-card p-4 sm:p-5">
            <p className="brand-kicker">USERS</p>
            <h2 className="mt-1 text-xl font-black">利用者</h2>
            <p className="mt-1 text-sm text-white/65">ログインできる人は10名ほどを想定しています。権限は管理者、編集、閲覧です。</p>
            <div className="mt-4 space-y-2">
              {users.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#071a33]/80 px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black">{item.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.role === "admin" ? "bg-[#f2c300] text-[#0b2545]" : item.role === "editor" ? "bg-[#ff6a00] text-black" : "bg-white/10 text-white/80"}`}>{roleLabel[item.role] || item.role}</span>
                    </div>
                    <div className="truncate text-xs text-white/55">{item.email}</div>
                  </div>
                  {item.id !== user.id && <button className="shrink-0 rounded-md border border-white/15 px-3 py-2 text-sm font-bold text-[#ffb067]" onClick={async () => { await fetch(`/api/users?id=${item.id}`, { method: "DELETE" }); await loadUsers(); }}>削除</button>}
                </div>
              ))}
            </div>
            <form className="mt-5 grid gap-2 sm:grid-cols-2" onSubmit={addUser}>
              <Input className="h-11 border-white/15 bg-[#071a33]" placeholder="氏名" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <Input className="h-11 border-white/15 bg-[#071a33]" type="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="メール" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              <Input className="h-11 border-white/15 bg-[#071a33]" type="password" placeholder="パスワード（10文字以上）" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
              <select className="field border-white/15 bg-[#071a33]" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="viewer">閲覧</option>
                <option value="editor">編集</option>
                <option value="admin">管理者</option>
              </select>
              <Button className="h-11 bg-[#ff6a00] font-black text-black hover:bg-[#ff8a1f] sm:col-span-2">利用者を追加</Button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLedger } from "./ledger-context";
import { MobilePageHeader } from "./shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Listed = { id: string; email: string; name: string; role: string };

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
    <div className="mx-auto max-w-3xl px-3 py-3 lg:px-6">
      <MobilePageHeader title="設定" />
      <h1 className="mb-4 hidden text-2xl font-black lg:block">設定</h1>
      <section className="panel mb-4 p-4">
        <h2 className="font-black">ログイン中</h2>
        <p className="mt-1 text-neutral-300">{user?.name}　{user?.role === "admin" ? "管理者" : user?.role === "editor" ? "編集" : "閲覧"}</p>
        <Button className="mt-3 h-11" variant="outline" onClick={logout}>ログアウト</Button>
      </section>
      {user?.role === "admin" && (
        <>
          <section className="panel mb-4 p-4">
            <h2 className="font-black">原本の取り込み</h2>
            <p className="mt-1 text-sm text-neutral-400">現行の state JSON、または「案件,地域,作業員,所属,単位,1,2,…」のCSVを読み込みます。作業員名はサーバーだけに保存されます。</p>
            <input className="mt-3 block text-sm" type="file" accept="application/json,text/csv,.json,.csv" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setText(await file.text());
            }} />
            {fileName && <p className="mt-2 text-sm">{fileName}　{text.length.toLocaleString()}文字</p>}
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={replaceEvents} onChange={(event) => setReplaceEvents(event.target.checked)} />訂正履歴も置き換える</label>
            <Button className="mt-3 h-11 bg-[#ff6a00] font-black text-black" disabled={!text} onClick={() => void importFile()}>取り込む</Button>
          </section>
          <section className="panel p-4">
            <h2 className="font-black">利用者</h2>
            <div className="mt-3 space-y-2">
              {users.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
                  <div>
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs text-neutral-400">{item.email}　{item.role}</div>
                  </div>
                  {item.id !== user.id && <button className="text-sm text-[#ff8a33]" onClick={async () => { await fetch(`/api/users?id=${item.id}`, { method: "DELETE" }); await loadUsers(); }}>削除</button>}
                </div>
              ))}
            </div>
            <form className="mt-4 grid gap-2" onSubmit={addUser}>
              <Input className="h-11" placeholder="氏名" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <Input className="h-11" type="email" placeholder="メール" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              <Input className="h-11" type="password" placeholder="パスワード（10文字以上）" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
              <select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="viewer">閲覧</option>
                <option value="editor">編集</option>
                <option value="admin">管理者</option>
              </select>
              <Button className="h-11 bg-[#ff6a00] font-black text-black">利用者を追加</Button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

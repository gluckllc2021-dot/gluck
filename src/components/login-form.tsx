"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@gluck.example");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/auth/login")
      .then((response) => response.json())
      .then((body) => {
        setNeedsSetup(!!body.needsSetup);
      })
      .catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const body = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage(body.error || "ログインできませんでした。");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="hazard relative hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-[#0e0e0e]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <div className="text-5xl font-black leading-tight">今日の現場が、<br />ひと目でわかる。</div>
          <p className="mt-4 max-w-md text-lg text-white/90">出面、実人数、要員不足、2現場出勤。グリュック合同会社の確認台帳です。</p>
        </div>
      </section>
      <section className="flex items-center justify-center bg-[#0e0e0e] px-5 py-10">
        <form onSubmit={submit} className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-md bg-[#ff6a00] text-2xl font-black italic text-black">G</div>
            <div>
              <div className="text-sm text-neutral-400">グリュック合同会社</div>
              <h1 className="text-2xl font-black">出面確認台帳</h1>
            </div>
          </div>
          <label className="grid gap-1 text-sm text-neutral-300">メールアドレス
            <Input className="h-12" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </label>
          <label className="mt-3 grid gap-1 text-sm text-neutral-300">パスワード
            <Input className="h-12" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </label>
          {message && <p className="mt-3 text-sm font-bold text-[#ffb067]">{message}</p>}
          {needsSetup && <p className="mt-3 text-sm text-neutral-400">初期ユーザーが未作成です。サーバーで npm run user:create を実行してください。</p>}
          <Button disabled={pending} className="mt-5 h-12 w-full bg-[#ff6a00] text-base font-black text-black hover:bg-[#ff8a1f]">{pending ? "確認中…" : "ログイン"}</Button>
        </form>
      </section>
    </main>
  );
}

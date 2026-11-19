"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Montserrat } from "next/font/google";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const en = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700"] });

const bases = [
  ["OSAKA", "大阪本社"],
  ["TOKYO", "東京支店"],
  ["AOMORI", "青森営業所"],
  ["HAKODATE", "北海道（函館）"],
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
    <main className="grid min-h-dvh bg-[#071a33] lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative flex flex-col justify-between overflow-hidden px-5 py-6 text-white sm:px-8 lg:px-14 lg:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(242,195,0,0.18),transparent_32%),linear-gradient(160deg,#0b2545_0%,#071a33_55%,#101113_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />
        <div className="relative">
          <img src="/brand/logo-white.png" alt="グリュック合同会社" className="h-12 w-auto sm:h-14 lg:h-16" />
          <p className={`${en.className} mt-6 text-[11px] font-semibold tracking-[0.28em] text-white/80 sm:text-xs`}>
            GLÜCK LLC <span className="text-[#f2c300]">─</span> ELECTRICAL ENGINEERING
          </p>
          <p className={`${en.className} mt-3 max-w-xl text-sm font-medium tracking-[0.08em] text-white/90 sm:text-base`}>
            Connecting Power, People &amp; Technology.
          </p>
          <h1 className="mt-4 text-[1.65rem] font-black leading-tight tracking-wide sm:text-4xl lg:text-5xl">
            人と技術で、<br />電気をつなぐ。
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70 sm:text-[15px]">
            大阪・東京・青森の3拠点と北海道（函館）。全国の現場の出面を、社員だけが確認します。
          </p>
        </div>
        <div className="relative mt-8">
          <p className={`${en.className} text-[10px] font-semibold tracking-[0.22em] text-[#f2c300]`}>OUR BASES</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4 lg:max-w-xl lg:grid-cols-2">
            {bases.map(([code, label]) => (
              <li key={code}>
                <span className={`${en.className} block text-[10px] tracking-[0.16em] text-white/45`}>{code}</span>
                <span className="font-bold">{label}</span>
              </li>
            ))}
          </ul>
          <div className="hazard-thin mt-6 h-2 w-28 rounded-sm" />
        </div>
      </section>
      <section className="flex items-center bg-[#101113] px-5 py-8 sm:px-8 lg:px-12">
        <form onSubmit={submit} className="mx-auto w-full max-w-md">
          <p className={`${en.className} text-[12px] font-semibold tracking-[0.18em] text-[#ff6a00]`}>STAFF ONLY</p>
          <h2 className="mt-2 text-3xl font-black tracking-wide">出面確認台帳</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">社員専用です。ログインした人だけが、今日の出面を見られます。</p>
          <label className="mt-8 grid gap-2 text-sm font-medium text-neutral-200">
            メールアドレス
            <Input
              className="h-12 border-[#3a3a3a] bg-[#171717] text-base"
              type="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="name@gluck.example"
            />
          </label>
          <label className="mt-4 grid gap-2 text-sm font-medium text-neutral-200">
            パスワード
            <Input
              className="h-12 border-[#3a3a3a] bg-[#171717] text-base"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          {message && <p className="mt-3 text-sm font-bold text-[#ffb067]">{message}</p>}
          {needsSetup && <p className="mt-3 text-sm text-neutral-400">初期ユーザーが未作成です。サーバーで npm run user:create を実行してください。</p>}
          <Button disabled={pending} className="mt-6 h-12 w-full bg-[#ff6a00] text-base font-black text-black hover:bg-[#ff8a1f]">
            {pending ? "確認中…" : "ログイン"}
          </Button>
          <p className="mt-6 text-xs leading-relaxed text-neutral-500">大阪本社　大阪府茨木市　／　この画面は検索エンジンに掲載しません。</p>
        </form>
      </section>
    </main>
  );
}

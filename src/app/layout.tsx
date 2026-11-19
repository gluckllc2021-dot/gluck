import type { Metadata } from "next";
import { Noto_Sans_JP, Oswald } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const noto = Noto_Sans_JP({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const oswald = Oswald({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-num",
  display: "swap",
});

export const metadata: Metadata = {
  title: "出面確認台帳｜グリュック合同会社",
  description: "現場ごとの出面・実人数・要員不足を確認する台帳",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`dark ${noto.variable} ${oswald.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-[#0e0e0e] text-[#f5f5f5] antialiased">
        <ThemeProvider attribute="class" forcedTheme="dark" enableSystem={false}>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}

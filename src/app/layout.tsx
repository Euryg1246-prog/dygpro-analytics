import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { AlertBadge } from "@/components/AlertBadge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DYGPRO Analytics",
  description: "Trading session analytics for NQ/MNQ futures",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <nav className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-4">
            <Link href="/" className="font-bold text-base text-emerald-400 shrink-0">DYGPRO</Link>
            <div className="flex gap-1 text-xs overflow-x-auto scrollbar-none flex-1">
              <Link href="/" className="text-zinc-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-zinc-800 whitespace-nowrap">Dashboard</Link>
              <Link href="/sizing" className="text-yellow-400 font-semibold transition px-2 py-1 rounded-lg bg-yellow-400/10 whitespace-nowrap">⚖️ Sizing</Link>
              <Link href="/domingo" className="text-emerald-400 font-semibold transition px-2 py-1 rounded-lg bg-emerald-500/10 whitespace-nowrap">⚡ SE Vivo</Link>
              <Link href="/breakout" className="text-blue-400 font-semibold transition px-2 py-1 rounded-lg bg-blue-500/10 whitespace-nowrap">⚡ BK Vivo</Link>
              <Link href="/sesiones" className="text-zinc-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-zinc-800 whitespace-nowrap">Sesiones</Link>
              <Link href="/importar" className="text-zinc-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-zinc-800 whitespace-nowrap">Importar</Link>
              <Link href="/comparar" className="text-zinc-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-zinc-800 whitespace-nowrap">Comparar</Link>
              <Link href="/alertas" className="text-zinc-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-zinc-800 whitespace-nowrap">Alertas</Link>
              <Link href="/webhook" className="text-zinc-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-zinc-800 whitespace-nowrap hidden md:block">Webhook</Link>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <AlertBadge />
              <LogoutButton />
            </div>
          </div>
        </nav>
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
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
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-8 h-14">
            <Link href="/" className="font-bold text-lg text-emerald-400">DYGPRO Analytics</Link>
            <div className="flex gap-6 text-sm">
              <Link href="/" className="text-zinc-400 hover:text-white transition">Dashboard</Link>
              <Link href="/domingo" className="text-emerald-400 hover:text-emerald-300 font-semibold transition">⚡ En Vivo</Link>
              <Link href="/sesiones" className="text-zinc-400 hover:text-white transition">Sesiones</Link>
              <Link href="/importar" className="text-zinc-400 hover:text-white transition">Importar</Link>
              <Link href="/comparar" className="text-zinc-400 hover:text-white transition">Comparar</Link>
              <Link href="/webhook" className="text-zinc-400 hover:text-white transition">Webhook</Link>
            </div>
            <div className="ml-auto">
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

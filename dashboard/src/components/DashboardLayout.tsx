"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  History,
  Settings,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  X,
} from "lucide-react";

// Sidebar navigation items - adapted for Kora Reclaim Bot
const sidebarItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/" },
  { icon: Wallet, label: "Accounts", href: "/accounts" },
  { icon: History, label: "Reclaim History", href: "/history" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-zinc-950/80 backdrop-blur-xl border-r border-white/10 flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Kora Reclaim
            </h1>
            <p className="text-xs text-zinc-500 tracking-tight">Rent Recovery Bot</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {sidebarItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                isActive
                  ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-sm font-medium tracking-tight">{item.label}</span>
              {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-white/10 space-y-2">
        {/* Network indicator */}
        <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-zinc-900/50">
          <span className="text-xs text-zinc-400 tracking-tight">Network</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-400" />
            <span className="text-xs text-violet-400 font-medium tracking-tight">Devnet</span>
          </div>
        </div>
        
        <a
          href="https://explorer.solana.com/?cluster=devnet"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-300"
        >
          <ExternalLink className="w-5 h-5" />
          <span className="text-sm font-medium tracking-tight">Solana Explorer</span>
        </a>
      </div>
    </aside>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  );
}

// Modal component for dashboard - from styling bundle
export function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-auto mx-4 rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-light text-white tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        {/* Content */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  Clock,
  Wallet,
} from "lucide-react";
import { TrackedAccount } from "@/types";
import { truncateAddress, formatLamports, formatTimeAgo } from "@/lib/utils";

// AccountRow - following the TransactionRow pattern from styling bundle
export function AccountRow({ account }: { account: TrackedAccount }) {
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    navigator.clipboard.writeText(account.pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "inactive":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "closed":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "reclaimed":
        return "bg-violet-500/10 text-violet-400 border-violet-500/20";
      case "whitelisted":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  const getIconBg = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10";
      case "inactive":
        return "bg-yellow-500/10";
      case "closed":
        return "bg-red-500/10";
      case "reclaimed":
        return "bg-violet-500/10";
      default:
        return "bg-zinc-700/30";
    }
  };

  const getIconColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-400";
      case "inactive":
        return "text-yellow-400";
      case "closed":
        return "text-red-400";
      case "reclaimed":
        return "text-violet-400";
      default:
        return "text-zinc-400";
    }
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-white/5 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-white/10 transition-all duration-300">
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${getIconBg(account.status)}`}
        >
          <Wallet className={`w-5 h-5 ${getIconColor(account.status)}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-white tracking-tight font-mono">
              {truncateAddress(account.pubkey, 8, 6)}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${getStatusBadge(account.status)}`}
            >
              {account.status}
            </span>
            {account.isWhitelisted && (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">
                protected
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 tracking-tight mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {account.lastCheckedAt ? formatTimeAgo(account.lastCheckedAt) : "Never checked"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-sm font-medium tracking-tight text-white">
            {formatLamports(account.rentLamports)} SOL
          </div>
          <div className="text-xs text-zinc-500 tracking-tight">
            {account.accountType}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyAddress}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            title="Copy address"
          >
            {copied ? (
              <Check className="w-4 h-4 text-violet-400" />
            ) : (
              <Copy className="w-4 h-4 text-zinc-500" />
            )}
          </button>
          <a
            href={`https://explorer.solana.com/address/${account.pubkey}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            title="View on Explorer"
          >
            <ExternalLink className="w-4 h-4 text-zinc-500" />
          </a>
        </div>
      </div>
    </div>
  );
}

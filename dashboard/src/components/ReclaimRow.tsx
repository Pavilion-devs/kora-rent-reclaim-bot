"use client";

import { useState } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  Clock,
  ArrowDownRight,
} from "lucide-react";
import { ReclaimTransaction } from "@/types";
import { truncateAddress, formatLamports, formatTimeAgo } from "@/lib/utils";

// ReclaimRow - following the TransactionRow pattern from styling bundle
export function ReclaimRow({ transaction }: { transaction: ReclaimTransaction }) {
  const [copied, setCopied] = useState(false);

  const copySignature = () => {
    navigator.clipboard.writeText(transaction.txSignature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (success: boolean) => {
    return success
      ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
      : "bg-red-500/10 text-red-400 border-red-500/20";
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-white/5 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-white/10 transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-violet-500/10">
          <ArrowDownRight className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-white tracking-tight">
              Reclaimed from{" "}
              <span className="font-mono text-violet-400">
                {truncateAddress(transaction.accountPubkey, 6, 4)}
              </span>
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${getStatusBadge(transaction.success)}`}
            >
              {transaction.success ? "confirmed" : "failed"}
            </span>
          </div>
          <div className="text-xs text-zinc-500 tracking-tight mt-1 font-mono">
            {truncateAddress(transaction.txSignature, 12, 8)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-sm font-medium tracking-tight text-violet-400">
            +{formatLamports(transaction.lamportsReclaimed)} SOL
          </div>
          <div className="text-xs text-zinc-500 tracking-tight flex items-center gap-1 justify-end">
            <Clock className="w-3 h-3" />
            {formatTimeAgo(transaction.reclaimedAt)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copySignature}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            title="Copy signature"
          >
            {copied ? (
              <Check className="w-4 h-4 text-violet-400" />
            ) : (
              <Copy className="w-4 h-4 text-zinc-500" />
            )}
          </button>
          <a
            href={`https://explorer.solana.com/tx/${transaction.txSignature}?cluster=devnet`}
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

"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  Search,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ReclaimRow } from "@/components/ReclaimRow";
import { ReclaimTransaction } from "@/types";
import { formatLamports, LAMPORTS_PER_SOL } from "@/lib/utils";

export default function HistoryPage() {
  const [reclaims, setReclaims] = useState<ReclaimTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSuccess, setFilterSuccess] = useState<"all" | "success" | "failed">("all");

  // Fetch reclaims from API
  const fetchReclaims = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/reclaims");
      if (res.ok) {
        const data = await res.json();
        setReclaims(data);
      }
    } catch (error) {
      console.error("Error fetching reclaims:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReclaims();
  }, []);

  // Filter reclaims
  const filteredReclaims = reclaims.filter((tx) => {
    const matchesSearch =
      !searchQuery ||
      tx.accountPubkey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.txSignature.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterSuccess === "all") return matchesSearch;
    if (filterSuccess === "success") return matchesSearch && tx.success;
    return matchesSearch && !tx.success;
  });

  // Calculate totals
  const totalReclaimed = reclaims
    .filter((tx) => tx.success)
    .reduce((sum, tx) => sum + tx.lamportsReclaimed, 0);
  const successCount = reclaims.filter((tx) => tx.success).length;
  const failedCount = reclaims.filter((tx) => !tx.success).length;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-light text-white tracking-tight">
            Reclaim History
          </h1>
          <p className="text-zinc-400 tracking-tight mt-1">
            {reclaims.length} transactions • {formatLamports(totalReclaimed)} SOL reclaimed
          </p>
        </div>
        <button
          onClick={fetchReclaims}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600/90 hover:bg-violet-600 text-white text-sm font-medium transition-all hover:scale-105 transform tracking-tight shadow-lg disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl">
          <div className="text-sm text-zinc-400 tracking-tight">Total Reclaimed</div>
          <div className="text-2xl font-light text-violet-400 tracking-tight mt-1">
            {formatLamports(totalReclaimed)} SOL
          </div>
        </div>
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl">
          <div className="text-sm text-zinc-400 tracking-tight">Successful</div>
          <div className="text-2xl font-light text-green-400 tracking-tight mt-1">
            {successCount}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl">
          <div className="text-sm text-zinc-400 tracking-tight">Failed</div>
          <div className="text-2xl font-light text-red-400 tracking-tight mt-1">
            {failedCount}
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl overflow-hidden">
        {/* Filters */}
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by address or signature..."
                  className="pl-10 pr-4 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight w-72"
                />
              </div>
            </div>

            {/* Filter */}
            <div className="flex items-center rounded-lg border border-white/10 bg-zinc-900/50 p-1">
              {(["all", "success", "failed"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterSuccess(type)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tracking-tight ${
                    filterSuccess === type
                      ? "bg-violet-500/20 text-violet-400"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-zinc-400 tracking-tight">Loading history...</p>
            </div>
          ) : filteredReclaims.length > 0 ? (
            filteredReclaims.map((tx) => <ReclaimRow key={tx.id} transaction={tx} />)
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-zinc-900/50 flex items-center justify-center">
                <TrendingUp className="w-10 h-10 text-zinc-600" />
              </div>
              <p className="text-zinc-400 tracking-tight text-lg">No reclaims found</p>
              <p className="text-sm text-zinc-500 tracking-tight mt-2 max-w-md mx-auto">
                {searchQuery || filterSuccess !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Reclaims will appear here once executed via CLI"}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {filteredReclaims.length > 0 && (
          <div className="p-4 border-t border-white/10">
            <span className="text-sm text-zinc-500 tracking-tight">
              Showing {filteredReclaims.length} of {reclaims.length} transactions
            </span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

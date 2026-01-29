"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Wallet,
  TrendingUp,
  BarChart3,
  Clock,
  Search,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { AccountRow } from "@/components/AccountRow";
import { ReclaimRow } from "@/components/ReclaimRow";
import { AccountStats, TrackedAccount, ReclaimTransaction } from "@/types";
import { formatLamports, LAMPORTS_PER_SOL } from "@/lib/utils";

export default function DashboardPage() {
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [reclaims, setReclaims] = useState<ReclaimTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "active" | "closed">("all");

  // Fetch data from API
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, accountsRes, reclaimsRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/accounts?limit=10"),
        fetch("/api/reclaims?limit=5"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(accountsData);
      }

      if (reclaimsRes.ok) {
        const reclaimsData = await reclaimsRes.json();
        setReclaims(reclaimsData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter accounts based on search and type
  const filteredAccounts = accounts.filter((account) => {
    if (!searchQuery) {
      if (filterType === "all") return true;
      return account.status === filterType;
    }
    const query = searchQuery.toLowerCase();
    const matchesSearch = account.pubkey.toLowerCase().includes(query);
    if (filterType === "all") return matchesSearch;
    return matchesSearch && account.status === filterType;
  });

  // Get recent 5 for the dashboard view
  const recentAccounts = filteredAccounts.slice(0, 5);

  const totalReclaimed = stats?.totalRentReclaimed || 0;
  const reclaimedSol = totalReclaimed / LAMPORTS_PER_SOL;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-light text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-zinc-400 tracking-tight mt-1">
            Monitor your Kora-sponsored account rent reclaims
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600/90 hover:bg-violet-600 text-white text-sm font-medium transition-all hover:scale-105 transform tracking-tight shadow-lg disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh Data
        </button>
      </div>

      {/* Bot Info */}
      <div className="mb-8 p-4 rounded-xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm text-zinc-400 tracking-tight">
              Bot Status
            </div>
            <div className="text-white font-medium tracking-tight">
              Kora Rent Reclaim Bot
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-400"></div>
          <span className="text-sm text-violet-400 tracking-tight">Devnet</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Total Reclaimed"
          value={stats ? `${formatLamports(stats.totalRentReclaimed)} SOL` : "Loading..."}
          subValue={
            totalReclaimed > 0
              ? `~$${(reclaimedSol * 100).toFixed(2)} USD`
              : "No reclaims yet"
          }
          icon={Wallet}
        />
        <StatCard
          title="Tracked Accounts"
          value={stats?.totalAccounts.toString() || "0"}
          subValue={`${stats?.closedAccounts || 0} closed, ${stats?.activeAccounts || 0} active`}
          icon={BarChart3}
        />
        <StatCard
          title="Reclaimable"
          value={stats ? `${formatLamports(stats.reclaimableRent)} SOL` : "Loading..."}
          subValue="From closed accounts"
          icon={TrendingUp}
        />
      </div>

      {/* Accounts Section */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-xl font-light text-white tracking-tight">
              Recent Accounts
            </h2>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight w-48"
                />
              </div>
              {/* Filter */}
              <div className="flex items-center rounded-lg border border-white/10 bg-zinc-900/50 p-1">
                {(["all", "active", "closed"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors tracking-tight ${
                      filterType === type
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
        </div>

        {/* Accounts List */}
        <div className="p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-zinc-400 tracking-tight">
                Loading accounts...
              </p>
            </div>
          ) : recentAccounts.length > 0 ? (
            recentAccounts.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-900/50 flex items-center justify-center">
                <Inbox className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 tracking-tight">
                No accounts found
              </p>
              <p className="text-sm text-zinc-500 tracking-tight mt-1">
                Run the CLI discovery command to find sponsored accounts
              </p>
            </div>
          )}
        </div>

        {/* View All Link */}
        {accounts.length > 5 && (
          <div className="p-4 border-t border-white/10 text-center">
            <Link
              href="/accounts"
              className="text-sm text-violet-400 hover:text-violet-300 transition-colors tracking-tight inline-flex items-center gap-1"
            >
              View all accounts
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Recent Reclaims Section */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-light text-white tracking-tight">
            Recent Reclaims
          </h2>
        </div>

        <div className="p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-zinc-400 tracking-tight">
                Loading reclaims...
              </p>
            </div>
          ) : reclaims.length > 0 ? (
            reclaims.map((tx) => <ReclaimRow key={tx.id} transaction={tx} />)
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-900/50 flex items-center justify-center">
                <TrendingUp className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 tracking-tight">
                No reclaims yet
              </p>
              <p className="text-sm text-zinc-500 tracking-tight mt-1">
                Reclaims will appear here once executed via CLI
              </p>
            </div>
          )}
        </div>

        {reclaims.length > 5 && (
          <div className="p-4 border-t border-white/10 text-center">
            <Link
              href="/history"
              className="text-sm text-violet-400 hover:text-violet-300 transition-colors tracking-tight inline-flex items-center gap-1"
            >
              View all reclaims
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        )}
    </div>
    </DashboardLayout>
  );
}

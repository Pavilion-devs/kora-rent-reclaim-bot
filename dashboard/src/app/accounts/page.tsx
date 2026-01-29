"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Wallet,
  Search,
  Inbox,
  RefreshCw,
  Filter,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AccountRow } from "@/components/AccountRow";
import { TrackedAccount } from "@/types";
import { formatLamports, LAMPORTS_PER_SOL } from "@/lib/utils";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"created" | "rent" | "status">("created");

  // Fetch accounts from API
  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/accounts${filterStatus !== 'all' ? `?status=${filterStatus}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [filterStatus]);

  // Filter and sort accounts
  const filteredAccounts = accounts
    .filter((account) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        account.pubkey.toLowerCase().includes(query) ||
        account.accountType.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sortBy === "rent") return b.rentLamports - a.rentLamports;
      if (sortBy === "status") return a.status.localeCompare(b.status);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // Calculate totals
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.rentLamports, 0);
  const closedBalance = accounts
    .filter((acc) => acc.status === "closed")
    .reduce((sum, acc) => sum + acc.rentLamports, 0);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-light text-white tracking-tight">
            Tracked Accounts
          </h1>
          <p className="text-zinc-400 tracking-tight mt-1">
            {accounts.length} accounts • {formatLamports(totalBalance)} SOL total
          </p>
        </div>
        <button
          onClick={fetchAccounts}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600/90 hover:bg-violet-600 text-white text-sm font-medium transition-all hover:scale-105 transform tracking-tight shadow-lg disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl">
          <div className="text-sm text-zinc-400 tracking-tight">Active</div>
          <div className="text-2xl font-light text-green-400 tracking-tight mt-1">
            {accounts.filter((a) => a.status === "active").length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl">
          <div className="text-sm text-zinc-400 tracking-tight">Inactive</div>
          <div className="text-2xl font-light text-yellow-400 tracking-tight mt-1">
            {accounts.filter((a) => a.status === "inactive").length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl">
          <div className="text-sm text-zinc-400 tracking-tight">Closed</div>
          <div className="text-2xl font-light text-red-400 tracking-tight mt-1">
            {accounts.filter((a) => a.status === "closed").length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl">
          <div className="text-sm text-zinc-400 tracking-tight">Reclaimable</div>
          <div className="text-2xl font-light text-violet-400 tracking-tight mt-1">
            {formatLamports(closedBalance)} SOL
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl overflow-hidden">
        {/* Filters */}
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by address..."
                  className="pl-10 pr-4 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight w-64"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-zinc-500" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="closed">Closed</option>
                  <option value="reclaimed">Reclaimed</option>
                  <option value="whitelisted">Whitelisted</option>
                </select>
              </div>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight"
              >
                <option value="created">Sort by Date</option>
                <option value="rent">Sort by Rent</option>
                <option value="status">Sort by Status</option>
              </select>
            </div>
          </div>
        </div>

        {/* Accounts List */}
        <div className="p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-zinc-400 tracking-tight">Loading accounts...</p>
            </div>
          ) : filteredAccounts.length > 0 ? (
            filteredAccounts.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-zinc-900/50 flex items-center justify-center">
                <Inbox className="w-10 h-10 text-zinc-600" />
              </div>
              <p className="text-zinc-400 tracking-tight text-lg">No accounts found</p>
              <p className="text-sm text-zinc-500 tracking-tight mt-2 max-w-md mx-auto">
                {searchQuery || filterStatus !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Run the CLI discovery command to find sponsored accounts"}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {filteredAccounts.length > 0 && (
          <div className="p-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-sm text-zinc-500 tracking-tight">
              Showing {filteredAccounts.length} of {accounts.length} accounts
            </span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

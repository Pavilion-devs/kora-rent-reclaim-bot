"use client";

import { ArrowUpRight, ArrowDownRight } from "lucide-react";

// StatCard component - exact match to styling bundle
export function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="group overflow-hidden transition-all duration-500 hover:border-white/20 hover:bg-zinc-900/30 hover:shadow-xl bg-zinc-950/20 backdrop-blur-xl border border-white/10 rounded-xl p-6 relative">
      <div
        className="pointer-events-none opacity-40 absolute top-0 right-0 bottom-0 left-0"
        style={{
          background:
            "radial-gradient(260px 200px at 20% 10%, rgba(255,255,255,0.06), transparent 60%), radial-gradient(420px 320px at 110% 120%, rgba(63,63,70,0.35), transparent 60%)",
        }}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-zinc-400 tracking-tight">{title}</span>
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-violet-400" />
          </div>
        </div>
        <div className="text-3xl font-light text-white tracking-tight">
          {value}
        </div>
        {subValue && (
          <div className="text-sm text-zinc-500 tracking-tight mt-1">
            {subValue}
          </div>
        )}
        {trend && (
          <div
            className={`inline-flex items-center gap-1 mt-3 text-xs tracking-tight ${
              trend.positive ? "text-violet-400" : "text-zinc-400"
            }`}
          >
            {trend.positive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}

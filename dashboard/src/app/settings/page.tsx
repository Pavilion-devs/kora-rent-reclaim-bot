"use client";

import { useState } from "react";
import {
  Settings,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings state - these would be loaded from/saved to a config file
  const [settings, setSettings] = useState({
    solanaNetwork: "devnet",
    rpcUrl: "",
    koraSignerPubkey: "",
    monitorInterval: 5,
    minDormancyDays: 7,
    minReclaimSol: 0.001,
    dryRun: true,
    autoReclaim: false,
    logLevel: "info",
  });

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    
    // TODO: Save settings to config file via API
    try {
      // Simulating save
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Failed to save settings. Please try again.");
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-light text-white tracking-tight">
            Settings
          </h1>
          <p className="text-zinc-400 tracking-tight mt-1">
            Configure the Kora Rent Reclaim Bot
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600/90 hover:bg-violet-600 text-white text-sm font-medium transition-all hover:scale-105 transform tracking-tight shadow-lg"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Status Messages */}
      {saved && (
        <div className="mb-6 p-4 rounded-xl border border-green-500/30 bg-green-500/10 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span className="text-sm text-green-400 tracking-tight">
            Settings saved successfully
          </span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-400 tracking-tight">{error}</span>
        </div>
      )}

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Network Configuration */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-light text-white tracking-tight">
              Network Configuration
            </h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Solana Network
                </label>
                <select
                  value={settings.solanaNetwork}
                  onChange={(e) =>
                    setSettings({ ...settings, solanaNetwork: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-white focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight"
                >
                  <option value="devnet">Devnet</option>
                  <option value="testnet">Testnet</option>
                  <option value="mainnet-beta">Mainnet Beta</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Custom RPC URL <span className="text-zinc-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={settings.rpcUrl}
                  onChange={(e) =>
                    setSettings({ ...settings, rpcUrl: e.target.value })
                  }
                  placeholder="https://api.devnet.solana.com"
                  className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Kora Signer Public Key
              </label>
              <input
                type="text"
                value={settings.koraSignerPubkey}
                onChange={(e) =>
                  setSettings({ ...settings, koraSignerPubkey: e.target.value })
                }
                placeholder="Enter the Kora signer public key to monitor"
                className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight font-mono"
              />
              <p className="text-xs text-zinc-500 mt-2">
                This is the public key from your Kora node&apos;s signers.toml file
              </p>
            </div>
          </div>
        </div>

        {/* Bot Settings */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-light text-white tracking-tight">
              Bot Settings
            </h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Monitor Interval (minutes)
                </label>
                <input
                  type="number"
                  value={settings.monitorInterval}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      monitorInterval: parseInt(e.target.value) || 5,
                    })
                  }
                  min={1}
                  className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-white focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Min Dormancy (days)
                </label>
                <input
                  type="number"
                  value={settings.minDormancyDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minDormancyDays: parseInt(e.target.value) || 7,
                    })
                  }
                  min={1}
                  className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-white focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Min Reclaim Amount (SOL)
                </label>
                <input
                  type="number"
                  value={settings.minReclaimSol}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minReclaimSol: parseFloat(e.target.value) || 0.001,
                    })
                  }
                  step={0.001}
                  min={0}
                  className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-white focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-zinc-900/30">
                <div>
                  <div className="text-sm font-medium text-white">Dry Run Mode</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Simulate reclaims without sending transactions
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings({ ...settings, dryRun: !settings.dryRun })
                  }
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.dryRun ? "bg-violet-600" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.dryRun ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-zinc-900/30">
                <div>
                  <div className="text-sm font-medium text-white">Auto Reclaim</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Automatically reclaim eligible accounts
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings({ ...settings, autoReclaim: !settings.autoReclaim })
                  }
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.autoReclaim ? "bg-violet-600" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.autoReclaim ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Log Level
              </label>
              <select
                value={settings.logLevel}
                onChange={(e) =>
                  setSettings({ ...settings, logLevel: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl border border-white/10 bg-zinc-900/50 text-white focus:outline-none focus:border-violet-500/50 transition-colors tracking-tight"
              >
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
        </div>

        {/* CLI Commands Reference */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950/20 backdrop-blur-xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-light text-white tracking-tight">
              CLI Commands Reference
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-zinc-400 tracking-tight">
              Use these commands in your terminal to interact with the bot:
            </p>
            <div className="space-y-3">
              {[
                { cmd: "npm run cli -- status", desc: "View current bot status and stats" },
                { cmd: "npm run cli -- discover --signer <PUBKEY>", desc: "Discover sponsored accounts" },
                { cmd: "npm run cli -- list", desc: "List all tracked accounts" },
                { cmd: "npm run cli -- check <PUBKEY>", desc: "Check specific account status" },
                { cmd: "npm run cli -- reclaim <PUBKEY>", desc: "Reclaim rent from an account" },
                { cmd: "npm run service", desc: "Start the background monitoring service" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 p-3 rounded-lg bg-zinc-900/30"
                >
                  <code className="text-sm font-mono text-violet-400 flex-shrink-0">
                    {item.cmd}
                  </code>
                  <span className="text-sm text-zinc-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

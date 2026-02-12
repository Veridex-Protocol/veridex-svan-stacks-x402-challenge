"use client";

import { useState } from "react";
import { Key, Shield, Clock, DollarSign, Wallet } from "lucide-react";
import { apiPost, type SessionInfo } from "@/lib/api";

interface SessionManagerProps {
  session: SessionInfo | null;
  passkeyCredentialId: string | null;
  onSessionCreated: (session: SessionInfo) => void;
  onSessionDestroyed: () => void;
  balance: { microSTX: string; stx: string } | null;
}

export default function SessionManager({
  session,
  passkeyCredentialId,
  onSessionCreated,
  onSessionDestroyed,
  balance,
}: SessionManagerProps) {
  const [senderKey, setSenderKey] = useState("");
  const [dailyLimit, setDailyLimit] = useState("50");
  const [perTxLimit, setPerTxLimit] = useState("10");
  const [expiryHours, setExpiryHours] = useState("24");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createSession() {
    if (!senderKey.trim()) {
      setError("Private key is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await apiPost<{ session: SessionInfo }>("/api/session/create", {
        senderKey: senderKey.trim(),
        dailyLimitUSD: parseFloat(dailyLimit),
        perTxLimitUSD: parseFloat(perTxLimit),
        expiryHours: parseFloat(expiryHours),
        passkeyCredentialId,
      });
      onSessionCreated(res.session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  async function destroySession() {
    try {
      await apiPost("/api/session/destroy");
      onSessionDestroyed();
    } catch {
      // ignore
    }
  }

  if (session) {
    const expiresIn = Math.max(0, session.expiresAt - Date.now());
    const hoursLeft = Math.floor(expiresIn / 3600000);
    const minutesLeft = Math.floor((expiresIn % 3600000) / 60000);
    const spentPercent = session.dailyLimitUSD > 0
      ? Math.min(100, (session.totalSpentUSD / session.dailyLimitUSD) * 100)
      : 0;

    return (
      <div className="rounded-xl border border-card-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Key className="w-5 h-5 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Active Session</h2>
              <p className="text-xs text-muted font-mono">{session.id}</p>
            </div>
          </div>
          <button
            onClick={destroySession}
            className="px-3 py-1.5 text-xs rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
          >
            End Session
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-background/50">
            <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
              <Wallet className="w-3 h-3" />
              Address
            </div>
            <p className="text-sm font-mono truncate">{session.senderAddress}</p>
            {balance && (
              <p className="text-xs text-accent mt-1">{balance.stx} STX</p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-background/50">
            <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
              <Clock className="w-3 h-3" />
              Expires
            </div>
            <p className="text-sm">{hoursLeft}h {minutesLeft}m remaining</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted">Daily Budget</span>
              <span>
                <span className="font-semibold">${session.totalSpentUSD.toFixed(2)}</span>
                <span className="text-muted"> / ${session.dailyLimitUSD.toFixed(2)}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-background/50 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${spentPercent}%`,
                  backgroundColor: spentPercent > 80 ? "var(--danger)" : spentPercent > 50 ? "var(--warning)" : "var(--accent)",
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Per-Tx Limit</span>
            <span className="font-semibold">${session.perTxLimitUSD.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Transactions</span>
            <span className="font-semibold">{session.txCount}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-accent/10">
          <Shield className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Create Session</h2>
          <p className="text-sm text-muted">Configure agent session keys and spending limits</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-sm text-danger mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-muted mb-1.5">Stacks Private Key</label>
          <input
            type="password"
            value={senderKey}
            onChange={(e) => setSenderKey(e.target.value)}
            placeholder="Enter your Stacks testnet private key (hex)"
            className="w-full px-3 py-2.5 rounded-lg bg-background border border-card-border text-sm font-mono focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-xs text-muted mt-1">This key is used to sign STX transfers. Never use a mainnet key for testing.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="flex items-center gap-1 text-sm text-muted mb-1.5">
              <DollarSign className="w-3 h-3" />
              Daily Limit (USD)
            </label>
            <input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              min="1"
              step="1"
              className="w-full px-3 py-2.5 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="flex items-center gap-1 text-sm text-muted mb-1.5">
              <Shield className="w-3 h-3" />
              Per-Tx Limit (USD)
            </label>
            <input
              type="number"
              value={perTxLimit}
              onChange={(e) => setPerTxLimit(e.target.value)}
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2.5 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="flex items-center gap-1 text-sm text-muted mb-1.5">
              <Clock className="w-3 h-3" />
              Expiry (hours)
            </label>
            <input
              type="number"
              value={expiryHours}
              onChange={(e) => setExpiryHours(e.target.value)}
              min="1"
              max="168"
              className="w-full px-3 py-2.5 rounded-lg bg-background border border-card-border text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <button
          onClick={createSession}
          disabled={loading || !senderKey.trim()}
          className="w-full px-4 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating session...
            </>
          ) : (
            <>
              <Key className="w-4 h-4" />
              Create Agent Session
            </>
          )}
        </button>
      </div>
    </div>
  );
}

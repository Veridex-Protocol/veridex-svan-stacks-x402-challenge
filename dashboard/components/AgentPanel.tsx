"use client";

import { useState } from "react";
import { Bot, Send, Zap, Database, TrendingUp } from "lucide-react";
import { apiPost, type PayResponse, type PendingApproval } from "@/lib/api";

interface AgentPanelProps {
  hasSession: boolean;
  onPaymentResult: (result: PayResponse) => void;
  onApprovalRequired: (approval: PendingApproval) => void;
}

const ENDPOINTS = [
  {
    path: "/api/v1/market/stx-price",
    label: "STX Price",
    icon: TrendingUp,
    cost: "0.1 STX",
    description: "Real-time STX/USD price data",
  },
  {
    path: "/api/v1/market/defi-yields",
    label: "DeFi Yields",
    icon: Database,
    cost: "0.2 STX",
    description: "Top DeFi yield opportunities on Stacks",
  },
  {
    path: "/api/v1/market/whale-alerts",
    label: "Whale Alerts",
    icon: Zap,
    cost: "0.5 STX",
    description: "Large transaction monitoring & alerts",
  },
];

export default function AgentPanel({
  hasSession,
  onPaymentResult,
  onApprovalRequired,
}: AgentPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, unknown>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  async function callEndpoint(endpoint: string) {
    setLoading(endpoint);
    setErrors((prev) => { const n = new Map(prev); n.delete(endpoint); return n; });

    try {
      const res = await apiPost<PayResponse>("/api/agent/pay", { endpoint });

      if (res.paid) {
        setResults((prev) => new Map(prev).set(endpoint, res.data));
        onPaymentResult(res);
      } else if (res.data) {
        setResults((prev) => new Map(prev).set(endpoint, res.data));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";

      // Check if it's a passkey approval requirement
      if (message.includes("Passkey approval required")) {
        try {
          // Re-fetch to get the approval details
          const statusRes = await fetch("/api/session/status");
          const status = await statusRes.json();
          if (status.pendingApproval) {
            onApprovalRequired(status.pendingApproval);
          }
        } catch {
          // ignore
        }
      } else {
        setErrors((prev) => new Map(prev).set(endpoint, message));
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-accent/10">
          <Bot className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Agent Control Panel</h2>
          <p className="text-sm text-muted">Trigger x402 paid API requests</p>
        </div>
      </div>

      {!hasSession ? (
        <p className="text-sm text-muted text-center py-6">
          Create a session first to enable agent payments.
        </p>
      ) : (
        <div className="space-y-3">
          {ENDPOINTS.map((ep) => {
            const Icon = ep.icon;
            const isLoading = loading === ep.path;
            const result = results.get(ep.path);
            const error = errors.get(ep.path);

            return (
              <div key={ep.path} className="rounded-lg border border-card-border overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className="p-2 rounded-lg bg-background/50">
                    <Icon className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{ep.label}</p>
                    <p className="text-xs text-muted">{ep.description}</p>
                  </div>
                  <span className="text-xs text-warning font-mono">{ep.cost}</span>
                  <button
                    onClick={() => callEndpoint(ep.path)}
                    disabled={isLoading || loading !== null}
                    className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isLoading ? (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    {isLoading ? "Paying..." : "Request"}
                  </button>
                </div>

                {error && (
                  <div className="px-3 pb-3">
                    <div className="p-2 rounded bg-danger/10 border border-danger/20 text-xs text-danger">
                      {error}
                    </div>
                  </div>
                )}

                {result !== undefined && (
                  <div className="px-3 pb-3">
                    <pre className="p-2 rounded bg-background/50 text-xs text-foreground/80 overflow-x-auto max-h-32 font-mono">
                      {String(JSON.stringify(result, null, 2))}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

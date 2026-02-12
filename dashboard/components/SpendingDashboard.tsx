"use client";

import { BarChart3, ArrowUpRight, ArrowDownRight, ExternalLink } from "lucide-react";
import type { SessionInfo, PaymentEvent } from "@/lib/api";

interface SpendingDashboardProps {
  session: SessionInfo | null;
  balance: { microSTX: string; stx: string } | null;
}

function StatusBadge({ status }: { status: PaymentEvent["status"] }) {
  const styles: Record<string, string> = {
    confirmed: "bg-success/10 text-success border-success/20",
    pending: "bg-warning/10 text-warning border-warning/20",
    failed: "bg-danger/10 text-danger border-danger/20",
    requires_passkey: "bg-accent/10 text-accent border-accent/20",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${styles[status] || styles.pending}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function microSTXtoSTX(micro: string) {
  return (parseInt(micro) / 1_000_000).toFixed(6);
}

export default function SpendingDashboard({ session, balance }: SpendingDashboardProps) {
  if (!session) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-muted/10">
            <BarChart3 className="w-5 h-5 text-muted" />
          </div>
          <h2 className="text-lg font-semibold">Spending Monitor</h2>
        </div>
        <p className="text-sm text-muted text-center py-8">
          Create a session to start monitoring agent spending.
        </p>
      </div>
    );
  }

  const spentPercent = session.dailyLimitUSD > 0
    ? Math.min(100, (session.totalSpentUSD / session.dailyLimitUSD) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-accent/10">
          <BarChart3 className="w-5 h-5 text-accent" />
        </div>
        <h2 className="text-lg font-semibold">Real-Time Spending</h2>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-muted">Live</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="p-3 rounded-lg bg-background/50 text-center">
          <p className="text-xs text-muted mb-1">Balance</p>
          <p className="text-lg font-bold">{balance ? balance.stx : "—"}</p>
          <p className="text-xs text-muted">STX</p>
        </div>
        <div className="p-3 rounded-lg bg-background/50 text-center">
          <p className="text-xs text-muted mb-1">Spent Today</p>
          <p className="text-lg font-bold">${session.totalSpentUSD.toFixed(2)}</p>
          <p className="text-xs text-muted">USD</p>
        </div>
        <div className="p-3 rounded-lg bg-background/50 text-center">
          <p className="text-xs text-muted mb-1">Remaining</p>
          <p className="text-lg font-bold text-success">${session.remainingUSD.toFixed(2)}</p>
          <p className="text-xs text-muted">USD</p>
        </div>
        <div className="p-3 rounded-lg bg-background/50 text-center">
          <p className="text-xs text-muted mb-1">Transactions</p>
          <p className="text-lg font-bold">{session.txCount}</p>
          <p className="text-xs text-muted">total</p>
        </div>
      </div>

      {/* Budget Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted mb-2">
          <span>Daily Budget Usage</span>
          <span>{spentPercent.toFixed(1)}%</span>
        </div>
        <div className="h-3 rounded-full bg-background/50 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${spentPercent}%`,
              background: spentPercent > 80
                ? "linear-gradient(90deg, var(--warning), var(--danger))"
                : spentPercent > 50
                ? "linear-gradient(90deg, var(--accent), var(--warning))"
                : "linear-gradient(90deg, var(--accent), var(--success))",
            }}
          />
        </div>
      </div>

      {/* Payment History */}
      <div>
        <h3 className="text-sm font-medium text-muted mb-3">Payment History</h3>
        {session.payments.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">No payments yet. Use the Agent Panel to make x402 requests.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...session.payments].reverse().map((payment) => (
              <div
                key={payment.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-background/50 animate-slide-up"
              >
                <div className={`p-1.5 rounded-lg ${payment.status === "confirmed" ? "bg-success/10" : payment.status === "failed" ? "bg-danger/10" : "bg-warning/10"}`}>
                  {payment.status === "confirmed" ? (
                    <ArrowUpRight className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 text-danger" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{payment.endpoint}</p>
                  <p className="text-xs text-muted">
                    {microSTXtoSTX(payment.amountMicroSTX)} STX · ${payment.amountUSD.toFixed(4)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <StatusBadge status={payment.status} />
                  <p className="text-xs text-muted mt-1">{formatTime(payment.timestamp)}</p>
                </div>
                {payment.txId && (
                  <a
                    href={`https://explorer.hiro.so/txid/${payment.txId}?chain=testnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-accent transition-colors"
                    title="View on Explorer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Wifi, WifiOff, Shield } from "lucide-react";
import { useWebSocket } from "@/lib/useWebSocket";
import { apiGet, type SessionInfo, type SessionStatusResponse, type PendingApproval, type PayResponse } from "@/lib/api";
import PasskeySetup from "@/components/PasskeySetup";
import SessionManager from "@/components/SessionManager";
import SpendingDashboard from "@/components/SpendingDashboard";
import AgentPanel from "@/components/AgentPanel";
import PasskeyApprovalModal from "@/components/PasskeyApprovalModal";

const WS_URL = "ws://localhost:3500/ws";

export default function Home() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [balance, setBalance] = useState<{ microSTX: string; stx: string } | null>(null);
  const [passkeyCredentialId, setPasskeyCredentialId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const { connected, on } = useWebSocket(WS_URL);

  // Fetch initial state
  useEffect(() => {
    async function fetchStatus() {
      try {
        const status = await apiGet<SessionStatusResponse>("/api/session/status");
        if (status.active && status.session) {
          setSession(status.session);
          if (status.balance) setBalance(status.balance);
          if (status.pendingApproval) setPendingApproval(status.pendingApproval);
        }
      } catch {
        // API not running yet
      }
    }
    fetchStatus();
  }, []);

  // WebSocket event handlers
  useEffect(() => {
    const unsubs = [
      on("init", (e) => {
        const data = e as unknown as { session?: SessionInfo; pendingApproval?: PendingApproval | null };
        if (data.session) setSession(data.session);
        if (data.pendingApproval) setPendingApproval(data.pendingApproval);
      }),
      on("session_created", (e) => {
        const data = e as unknown as { session: SessionInfo };
        setSession(data.session);
      }),
      on("session_destroyed", () => {
        setSession(null);
        setBalance(null);
        setPendingApproval(null);
      }),
      on("payment_confirmed", (e) => {
        const data = e as unknown as { session: SessionInfo };
        setSession(data.session);
      }),
      on("payment_started", () => {
        // Could show a loading indicator
      }),
      on("payment_failed", () => {
        // Refresh session state
        refreshSession();
      }),
      on("passkey_required", (e) => {
        const data = e as unknown as { approval: PendingApproval };
        setPendingApproval(data.approval);
      }),
      on("passkey_approved", () => {
        setPendingApproval(null);
      }),
      on("passkey_rejected", () => {
        setPendingApproval(null);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [on]);

  const refreshSession = useCallback(async () => {
    try {
      const status = await apiGet<SessionStatusResponse>("/api/session/status");
      if (status.active && status.session) {
        setSession(status.session);
        if (status.balance) setBalance(status.balance);
      }
    } catch {
      // ignore
    }
  }, []);

  // Poll balance every 10s when session is active
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(refreshSession, 10000);
    return () => clearInterval(interval);
  }, [session, refreshSession]);

  function handleSessionCreated(s: SessionInfo) {
    setSession(s);
    refreshSession();
  }

  function handlePaymentResult(_result: PayResponse) {
    refreshSession();
  }

  function handleApprovalRequired(approval: PendingApproval) {
    setPendingApproval(approval);
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-card-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Shield className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">S-VAN Dashboard</h1>
              <p className="text-xs text-muted">Stacks-Veridex Agent Nexus</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
                <Wifi className="w-3 h-3 text-success" />
                <span className="text-xs text-success">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-danger/10 border border-danger/20">
                <WifiOff className="w-3 h-3 text-danger" />
                <span className="text-xs text-danger">Disconnected</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Setup & Session */}
          <div className="space-y-6">
            <PasskeySetup
              onPasskeyRegistered={setPasskeyCredentialId}
              credentialId={passkeyCredentialId}
            />
            <SessionManager
              session={session}
              passkeyCredentialId={passkeyCredentialId}
              onSessionCreated={handleSessionCreated}
              onSessionDestroyed={() => {
                setSession(null);
                setBalance(null);
              }}
              balance={balance}
            />
            <AgentPanel
              hasSession={!!session}
              onPaymentResult={handlePaymentResult}
              onApprovalRequired={handleApprovalRequired}
            />
          </div>

          {/* Right Column: Spending Monitor */}
          <div>
            <SpendingDashboard session={session} balance={balance} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-card-border mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-muted">
          <span>S-VAN &middot; Stacks x402 Challenge &middot; Powered by Veridex Agent SDK</span>
          <span>Testnet Only</span>
        </div>
      </footer>

      {/* Passkey Approval Modal */}
      {pendingApproval && (
        <PasskeyApprovalModal
          approval={pendingApproval}
          credentialId={passkeyCredentialId}
          onApproved={() => {
            setPendingApproval(null);
            refreshSession();
          }}
          onRejected={() => setPendingApproval(null)}
        />
      )}
    </div>
  );
}

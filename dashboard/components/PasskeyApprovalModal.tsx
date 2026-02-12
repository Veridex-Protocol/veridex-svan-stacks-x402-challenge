"use client";

import { useState } from "react";
import { ShieldAlert, Fingerprint, X, AlertTriangle } from "lucide-react";
import { apiPost, type PendingApproval } from "@/lib/api";

interface PasskeyApprovalModalProps {
  approval: PendingApproval;
  credentialId: string | null;
  onApproved: () => void;
  onRejected: () => void;
}

export default function PasskeyApprovalModal({
  approval,
  credentialId,
  onApproved,
  onRejected,
}: PasskeyApprovalModalProps) {
  const [status, setStatus] = useState<"idle" | "authenticating" | "approving" | "error">("idle");
  const [error, setError] = useState("");

  async function handleApprove() {
    setStatus("authenticating");
    setError("");

    try {
      if (!window.PublicKeyCredential) {
        throw new Error("WebAuthn not supported");
      }

      // Request passkey assertion (authentication)
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: credentialId
            ? [
                {
                  id: Uint8Array.from(atob(credentialId.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
                  type: "public-key" as const,
                },
              ]
            : [],
          userVerification: "required",
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!assertion) {
        throw new Error("Passkey authentication cancelled");
      }

      setStatus("approving");

      // Send approval to backend
      const response = assertion.response as AuthenticatorAssertionResponse;
      await apiPost("/api/passkey/approve", {
        approvalId: approval.id,
        passkeyAssertion: {
          id: assertion.id,
          response: {
            authenticatorData: btoa(String.fromCharCode(...new Uint8Array(response.authenticatorData))),
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON))),
            signature: btoa(String.fromCharCode(...new Uint8Array(response.signature))),
          },
        },
      });

      onApproved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      setStatus("error");
    }
  }

  async function handleReject() {
    try {
      await apiPost("/api/passkey/reject");
    } catch {
      // ignore
    }
    onRejected();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl border border-danger/30 bg-card p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-danger/10 animate-pulse-glow">
              <ShieldAlert className="w-5 h-5 text-danger" />
            </div>
            <h2 className="text-lg font-semibold">Passkey Approval Required</h2>
          </div>
          <button
            onClick={handleReject}
            className="p-1.5 rounded-lg hover:bg-card-border transition-colors"
          >
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20 mb-4">
          <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-warning font-medium">Transaction exceeds spending limits</p>
            <p className="text-xs text-muted mt-1">{approval.reason}</p>
          </div>
        </div>

        {/* Transaction Details */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
            <span className="text-sm text-muted">Endpoint</span>
            <span className="text-sm font-mono">{approval.endpoint}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
            <span className="text-sm text-muted">Amount</span>
            <span className="text-sm font-semibold">
              {(parseInt(approval.amountMicroSTX) / 1_000_000).toFixed(6)} STX
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-background/50">
            <span className="text-sm text-muted">USD Value</span>
            <span className="text-sm font-semibold">${approval.amountUSD.toFixed(4)}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-sm text-danger mb-4">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleReject}
            className="flex-1 px-4 py-3 rounded-lg border border-card-border text-muted hover:text-foreground hover:border-foreground/20 transition-colors text-sm font-medium"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={status === "authenticating" || status === "approving"}
            className="flex-1 px-4 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
          >
            {status === "authenticating" || status === "approving" ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {status === "authenticating" ? "Verifying..." : "Approving..."}
              </>
            ) : (
              <>
                <Fingerprint className="w-4 h-4" />
                Approve with Passkey
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

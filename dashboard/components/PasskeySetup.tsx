"use client";

import { useState } from "react";
import { Fingerprint, CheckCircle, AlertCircle } from "lucide-react";

interface PasskeySetupProps {
  onPasskeyRegistered: (credentialId: string) => void;
  credentialId: string | null;
}

export default function PasskeySetup({ onPasskeyRegistered, credentialId }: PasskeySetupProps) {
  const [status, setStatus] = useState<"idle" | "registering" | "done" | "error">(
    credentialId ? "done" : "idle"
  );
  const [error, setError] = useState("");

  async function registerPasskey() {
    setStatus("registering");
    setError("");

    try {
      // Check WebAuthn support
      if (!window.PublicKeyCredential) {
        throw new Error("WebAuthn is not supported in this browser.");
      }

      // Generate a challenge
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      // Create credential
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: "S-VAN Dashboard",
            id: window.location.hostname,
          },
          user: {
            id: new Uint8Array(16).map(() => Math.floor(Math.random() * 256)),
            name: "agent@s-van.local",
            displayName: "S-VAN Agent",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },   // ES256 (P-256 / secp256r1)
            { alg: -257, type: "public-key" },  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error("Passkey registration was cancelled.");
      }

      const credId = credential.id;
      onPasskeyRegistered(credId);
      setStatus("done");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-accent/10">
          <Fingerprint className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Passkey Setup</h2>
          <p className="text-sm text-muted">Register a passkey to approve high-value transactions</p>
        </div>
      </div>

      {status === "done" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
          <CheckCircle className="w-4 h-4 text-success" />
          <span className="text-sm text-success">
            Passkey registered
          </span>
          <span className="text-xs text-muted ml-auto font-mono">
            {credentialId?.slice(0, 16)}...
          </span>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20 mb-3">
          <AlertCircle className="w-4 h-4 text-danger" />
          <span className="text-sm text-danger">{error}</span>
        </div>
      )}

      {status !== "done" && (
        <button
          onClick={registerPasskey}
          disabled={status === "registering"}
          className="w-full mt-2 px-4 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {status === "registering" ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Waiting for passkey...
            </>
          ) : (
            <>
              <Fingerprint className="w-4 h-4" />
              Register Passkey
            </>
          )}
        </button>
      )}
    </div>
  );
}

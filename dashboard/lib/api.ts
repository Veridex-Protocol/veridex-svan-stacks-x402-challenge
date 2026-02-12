const API_BASE = "";

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data as T;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data as T;
}

// Types matching the backend API responses
export interface SessionInfo {
  id: string;
  senderAddress: string;
  dailyLimitUSD: number;
  perTxLimitUSD: number;
  totalSpentUSD: number;
  totalSpentMicroSTX: string;
  remainingUSD: number;
  txCount: number;
  createdAt: number;
  expiresAt: number;
  payments: PaymentEvent[];
  hasPasskey: boolean;
}

export interface PaymentEvent {
  id: string;
  endpoint: string;
  amountMicroSTX: string;
  amountUSD: number;
  txId: string;
  status: "pending" | "confirmed" | "failed" | "requires_passkey";
  timestamp: number;
}

export interface PendingApproval {
  id: string;
  endpoint: string;
  amountMicroSTX: string;
  amountUSD: number;
  reason: string;
}

export interface SessionStatusResponse {
  active: boolean;
  session?: SessionInfo;
  balance?: { microSTX: string; stx: string };
  pendingApproval?: PendingApproval | null;
}

export interface PayResponse {
  paid: boolean;
  payment?: PaymentEvent;
  data?: unknown;
  session?: SessionInfo;
  error?: string;
  approval?: PendingApproval;
}

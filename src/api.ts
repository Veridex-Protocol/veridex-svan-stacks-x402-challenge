/**
 * S-VAN Dashboard API Server
 *
 * Backend API that powers the frontend dashboard:
 * - POST /api/session/create     — Create session with spending limits
 * - GET  /api/session/status      — Get current session status
 * - POST /api/agent/run           — Run the agent against x402 endpoints
 * - POST /api/agent/pay           — Execute a single x402 payment
 * - POST /api/passkey/approve     — Approve an over-limit tx via passkey
 * - GET  /api/spending/history    — Get payment history
 * - WebSocket /ws                 — Real-time spending events
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { sendSTXTransfer, checkTxStatus, getSTXBalance } from './stacks/signer.js';
import { StacksSpendingTracker } from '@veridex/agentic-payments';

const app = express();
app.use(cors());
app.use(express.json());

const API_PORT = parseInt(process.env.API_PORT || '3500', 10);
const X402_SERVER = process.env.X402_SERVER_HOST || 'http://localhost:3402';
const NETWORK = (process.env.STACKS_NETWORK || 'testnet') as 'mainnet' | 'testnet';

// ============================================================================
// In-Memory State
// ============================================================================

interface SessionState {
    id: string;
    senderKey: string;
    senderAddress: string;
    dailyLimitUSD: number;
    perTxLimitUSD: number;
    totalSpentUSD: number;
    totalSpentMicroSTX: bigint;
    txCount: number;
    createdAt: number;
    expiresAt: number;
    payments: PaymentEvent[];
    passkeyCredentialId: string | null;
}

interface PaymentEvent {
    id: string;
    endpoint: string;
    amountMicroSTX: string;
    amountUSD: number;
    txId: string;
    status: 'pending' | 'confirmed' | 'failed' | 'requires_passkey';
    timestamp: number;
}

interface PendingApproval {
    id: string;
    endpoint: string;
    amountMicroSTX: string;
    amountUSD: number;
    reason: string;
}

let currentSession: SessionState | null = null;
let pendingApproval: PendingApproval | null = null;
const spendingTracker = new StacksSpendingTracker();

// ============================================================================
// WebSocket
// ============================================================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.on('close', () => wsClients.delete(ws));

    // Send current state on connect
    ws.send(JSON.stringify({
        type: 'init',
        session: currentSession ? sanitizeSession(currentSession) : null,
        pendingApproval,
    }));
});

function broadcast(event: Record<string, unknown>) {
    const msg = JSON.stringify(event);
    for (const ws of wsClients) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
        }
    }
}

function sanitizeSession(s: SessionState) {
    return {
        id: s.id,
        senderAddress: s.senderAddress,
        dailyLimitUSD: s.dailyLimitUSD,
        perTxLimitUSD: s.perTxLimitUSD,
        totalSpentUSD: s.totalSpentUSD,
        totalSpentMicroSTX: s.totalSpentMicroSTX.toString(),
        remainingUSD: s.dailyLimitUSD - s.totalSpentUSD,
        txCount: s.txCount,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        payments: s.payments,
        hasPasskey: !!s.passkeyCredentialId,
    };
}

// ============================================================================
// API Routes
// ============================================================================

// Create a new agent session with spending limits
app.post('/api/session/create', async (req, res) => {
    const {
        senderKey,
        dailyLimitUSD = 50,
        perTxLimitUSD = 10,
        expiryHours = 24,
        passkeyCredentialId = null,
    } = req.body;

    if (!senderKey) {
        res.status(400).json({ error: 'senderKey is required (Stacks private key hex)' });
        return;
    }

    // Derive address from key (simplified — get from Hiro API)
    let senderAddress = 'ST_UNKNOWN';
    try {
        const { getAddressFromPrivateKey } = await import('@stacks/transactions');
        senderAddress = getAddressFromPrivateKey(senderKey, NETWORK);
    } catch (e: any) {
        console.warn('Could not derive address:', e.message);
    }

    currentSession = {
        id: `session_${Date.now().toString(36)}`,
        senderKey,
        senderAddress,
        dailyLimitUSD,
        perTxLimitUSD,
        totalSpentUSD: 0,
        totalSpentMicroSTX: 0n,
        txCount: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + expiryHours * 60 * 60 * 1000,
        payments: [],
        passkeyCredentialId,
    };

    broadcast({ type: 'session_created', session: sanitizeSession(currentSession) });

    res.json({
        success: true,
        session: sanitizeSession(currentSession),
    });
});

// Get current session status
app.get('/api/session/status', async (_req, res) => {
    if (!currentSession) {
        res.json({ active: false });
        return;
    }

    // Get live balance
    let balance = 0n;
    try {
        balance = await getSTXBalance(currentSession.senderAddress, NETWORK);
    } catch { /* ignore */ }

    res.json({
        active: true,
        session: sanitizeSession(currentSession),
        balance: {
            microSTX: balance.toString(),
            stx: (Number(balance) / 1_000_000).toFixed(6),
        },
        pendingApproval,
    });
});

// Execute a payment to an x402 endpoint
app.post('/api/agent/pay', async (req, res) => {
    const { endpoint } = req.body;

    if (!currentSession) {
        res.status(400).json({ error: 'No active session. Create one first.' });
        return;
    }

    if (Date.now() > currentSession.expiresAt) {
        res.status(400).json({ error: 'Session expired. Create a new one.' });
        return;
    }

    try {
        // Step 1: Hit the x402 endpoint to get payment requirement
        const initialRes = await fetch(`${X402_SERVER}${endpoint}`);

        if (initialRes.status !== 402) {
            // Free endpoint or already paid
            const data = initialRes.ok ? await initialRes.json() : null;
            res.json({ paid: false, data });
            return;
        }

        const paymentHeader = initialRes.headers.get('PAYMENT-REQUIRED');
        if (!paymentHeader) {
            res.status(500).json({ error: 'Missing PAYMENT-REQUIRED header' });
            return;
        }

        const requirement = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
        const payReq = requirement.paymentRequirements?.[0];
        if (!payReq) {
            res.status(500).json({ error: 'No payment requirements' });
            return;
        }

        const amountMicroSTX = payReq.maxAmountRequired;
        const amountUSD = await spendingTracker.estimatePaymentUSD(amountMicroSTX, payReq.asset || 'STX');

        // Step 2: Check spending limits
        const remainingUSD = currentSession.dailyLimitUSD - currentSession.totalSpentUSD;

        if (amountUSD > currentSession.perTxLimitUSD || amountUSD > remainingUSD) {
            // Over limit — require passkey approval
            const approvalId = `approval_${Date.now().toString(36)}`;
            pendingApproval = {
                id: approvalId,
                endpoint,
                amountMicroSTX,
                amountUSD,
                reason: amountUSD > currentSession.perTxLimitUSD
                    ? `Amount $${amountUSD.toFixed(4)} exceeds per-tx limit $${currentSession.perTxLimitUSD}`
                    : `Amount $${amountUSD.toFixed(4)} exceeds remaining budget $${remainingUSD.toFixed(2)}`,
            };

            broadcast({ type: 'passkey_required', approval: pendingApproval });

            res.status(403).json({
                error: 'Passkey approval required',
                approval: pendingApproval,
            });
            return;
        }

        // Step 3: Execute real STX payment
        const paymentId = `pay_${Date.now().toString(36)}`;
        const payment: PaymentEvent = {
            id: paymentId,
            endpoint,
            amountMicroSTX,
            amountUSD,
            txId: '',
            status: 'pending',
            timestamp: Date.now(),
        };

        currentSession.payments.push(payment);
        broadcast({ type: 'payment_started', payment });

        // Send real STX transfer
        const txResult = await sendSTXTransfer({
            recipient: payReq.payTo,
            amountMicroSTX: BigInt(amountMicroSTX),
            senderKey: currentSession.senderKey,
            network: NETWORK,
            memo: `S-VAN: ${endpoint}`,
        });

        if (txResult.success) {
            payment.txId = txResult.txId;
            payment.status = 'confirmed';
            currentSession.totalSpentUSD += amountUSD;
            currentSession.totalSpentMicroSTX += BigInt(amountMicroSTX);
            currentSession.txCount++;

            broadcast({
                type: 'payment_confirmed',
                payment,
                session: sanitizeSession(currentSession),
            });

            // Step 4: Retry the endpoint with payment proof
            const paymentProof = {
                success: true,
                transactionHash: txResult.txId,
                amount: amountMicroSTX,
                network: payReq.network,
            };

            const paidRes = await fetch(`${X402_SERVER}${endpoint}`, {
                headers: {
                    'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(paymentProof)).toString('base64'),
                },
            });

            const data = paidRes.ok ? await paidRes.json() : null;

            res.json({
                paid: true,
                payment,
                data,
                session: sanitizeSession(currentSession),
            });
        } else {
            payment.status = 'failed';
            broadcast({ type: 'payment_failed', payment, error: txResult.error });
            res.status(500).json({ error: `STX transfer failed: ${txResult.error}`, payment });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Approve a pending over-limit transaction via passkey
app.post('/api/passkey/approve', async (req, res) => {
    const { approvalId, passkeyAssertion } = req.body;

    if (!pendingApproval || pendingApproval.id !== approvalId) {
        res.status(400).json({ error: 'No matching pending approval' });
        return;
    }

    if (!currentSession) {
        res.status(400).json({ error: 'No active session' });
        return;
    }

    // In production: verify the WebAuthn assertion signature
    // For the hackathon: we verify the assertion has the required fields
    if (!passkeyAssertion || !passkeyAssertion.id || !passkeyAssertion.response) {
        res.status(400).json({ error: 'Invalid passkey assertion' });
        return;
    }

    const approval = pendingApproval;
    pendingApproval = null;

    broadcast({ type: 'passkey_approved', approvalId: approval.id });

    // Now execute the payment (bypassing limits since passkey approved)
    const paymentId = `pay_${Date.now().toString(36)}`;
    const payment: PaymentEvent = {
        id: paymentId,
        endpoint: approval.endpoint,
        amountMicroSTX: approval.amountMicroSTX,
        amountUSD: approval.amountUSD,
        txId: '',
        status: 'pending',
        timestamp: Date.now(),
    };

    currentSession.payments.push(payment);
    broadcast({ type: 'payment_started', payment });

    // Fetch the payment requirement again
    try {
        const initialRes = await fetch(`${X402_SERVER}${approval.endpoint}`);
        const paymentHeader = initialRes.headers.get('PAYMENT-REQUIRED');
        const requirement = JSON.parse(Buffer.from(paymentHeader!, 'base64').toString());
        const payReq = requirement.paymentRequirements[0];

        const txResult = await sendSTXTransfer({
            recipient: payReq.payTo,
            amountMicroSTX: BigInt(approval.amountMicroSTX),
            senderKey: currentSession.senderKey,
            network: NETWORK,
            memo: `S-VAN passkey-approved: ${approval.endpoint}`,
        });

        if (txResult.success) {
            payment.txId = txResult.txId;
            payment.status = 'confirmed';
            currentSession.totalSpentUSD += approval.amountUSD;
            currentSession.totalSpentMicroSTX += BigInt(approval.amountMicroSTX);
            currentSession.txCount++;

            broadcast({
                type: 'payment_confirmed',
                payment,
                session: sanitizeSession(currentSession),
            });

            // Get the data
            const paymentProof = {
                success: true,
                transactionHash: txResult.txId,
                amount: approval.amountMicroSTX,
                network: payReq.network,
            };

            const paidRes = await fetch(`${X402_SERVER}${approval.endpoint}`, {
                headers: {
                    'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(paymentProof)).toString('base64'),
                },
            });

            const data = paidRes.ok ? await paidRes.json() : null;
            res.json({ paid: true, payment, data, session: sanitizeSession(currentSession) });
        } else {
            payment.status = 'failed';
            broadcast({ type: 'payment_failed', payment, error: txResult.error });
            res.status(500).json({ error: txResult.error, payment });
        }
    } catch (error: any) {
        payment.status = 'failed';
        res.status(500).json({ error: error.message });
    }
});

// Reject a pending approval
app.post('/api/passkey/reject', (_req, res) => {
    if (pendingApproval) {
        broadcast({ type: 'passkey_rejected', approvalId: pendingApproval.id });
        pendingApproval = null;
    }
    res.json({ success: true });
});

// Get spending history
app.get('/api/spending/history', (_req, res) => {
    res.json({
        payments: currentSession?.payments || [],
        totalSpentUSD: currentSession?.totalSpentUSD || 0,
        totalSpentMicroSTX: (currentSession?.totalSpentMicroSTX || 0n).toString(),
        txCount: currentSession?.txCount || 0,
    });
});

// Destroy session
app.post('/api/session/destroy', (_req, res) => {
    currentSession = null;
    pendingApproval = null;
    broadcast({ type: 'session_destroyed' });
    res.json({ success: true });
});

// ============================================================================
// Start
// ============================================================================

server.listen(API_PORT, () => {
    console.log(`\n  S-VAN Dashboard API`);
    console.log(`  http://localhost:${API_PORT}\n`);
    console.log(`  REST:      http://localhost:${API_PORT}/api/...`);
    console.log(`  WebSocket: ws://localhost:${API_PORT}/ws`);
    console.log(`  Dashboard: http://localhost:${API_PORT}\n`);
});

// Serve the frontend dashboard
app.use(express.static('public'));

export default app;

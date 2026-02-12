/**
 * S-VAN x402 Paid API Server
 *
 * Express server that serves premium Stacks market data behind x402 paywalls.
 * Uses the x402 middleware for payment gating with optional on-chain verification.
 *
 * Endpoints:
 * - GET /api/v1/stx-whales    — Premium whale monitoring (0.1 STX)
 * - GET /api/v1/sbtc-yield    — sBTC yield analysis (0.2 STX)
 * - GET /api/v1/clarity-audit — Clarity contract audit (0.5 STX)
 * - GET /health               — Health check + service discovery (free)
 */
import 'dotenv/config';
import express from 'express';
import { createX402Middleware, getVerifiedTxCount } from './x402/middleware.js';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.X402_SERVER_PORT || '3402', 10);
const RECIPIENT = process.env.X402_RECIPIENT_ADDRESS || 'ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN';
const NETWORK = (process.env.STACKS_NETWORK || 'testnet') as 'mainnet' | 'testnet';
const HIRO_API_KEY = process.env.HIRO_API_KEY;
const STACKS_CAIP2 = NETWORK === 'mainnet' ? 'stacks:1' : 'stacks:2147483648';

// ============================================================================
// x402 Middleware Setup
// ============================================================================

const { requirePayment } = createX402Middleware({
    recipient: RECIPIENT,
    networkCAIP2: STACKS_CAIP2,
    hiroApiKey: HIRO_API_KEY,
    stacksNetwork: NETWORK,
    // In demo mode (no HIRO_API_KEY), skip on-chain verification.
    // In production, set HIRO_API_KEY to enable real tx verification.
    skipOnChainVerification: !HIRO_API_KEY,
});

// ============================================================================
// Premium Data Endpoints
// ============================================================================

// STX Whale Monitoring — 0.1 STX (100,000 microSTX)
app.get(
    '/api/v1/stx-whales',
    requirePayment({ amount: '100000', asset: 'STX', description: 'Premium STX whale monitoring data' }),
    (_req, res) => {
        res.json({
            timestamp: new Date().toISOString(),
            data: {
                topWhales: [
                    { address: 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE', balance: '2,450,000 STX', change24h: '+12,500 STX' },
                    { address: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7', balance: '1,890,000 STX', change24h: '-5,200 STX' },
                    { address: 'SP1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE', balance: '1,234,567 STX', change24h: '+45,000 STX' },
                ],
                totalWhaleVolume24h: '8,450,000 STX',
                netWhaleFlow: '+52,300 STX (accumulating)',
                sentiment: 'Bullish — large holders accumulating',
            },
        });
    },
);

// sBTC Yield Analysis — 0.2 STX (200,000 microSTX)
app.get(
    '/api/v1/sbtc-yield',
    requirePayment({ amount: '200000', asset: 'STX', description: 'sBTC yield strategy analysis with risk scoring' }),
    (_req, res) => {
        res.json({
            timestamp: new Date().toISOString(),
            data: {
                strategies: [
                    { protocol: 'ALEX DeFi', pool: 'sBTC-STX LP', apy: '8.5%', tvl: '$12.4M', riskScore: 'Low', recommendation: 'Strong Buy' },
                    { protocol: 'Arkadiko', pool: 'sBTC Vault', apy: '6.2%', tvl: '$8.1M', riskScore: 'Low', recommendation: 'Buy' },
                    { protocol: 'Velar', pool: 'sBTC-USDA', apy: '12.1%', tvl: '$3.2M', riskScore: 'Medium', recommendation: 'Hold — higher IL risk' },
                ],
                bestStrategy: 'ALEX sBTC-STX LP (8.5% APY, Low Risk)',
                marketCondition: 'Favorable for sBTC yield farming',
            },
        });
    },
);

// Clarity Contract Audit — 0.5 STX (500,000 microSTX)
app.get(
    '/api/v1/clarity-audit',
    requirePayment({ amount: '500000', asset: 'STX', description: 'Automated Clarity smart contract security audit' }),
    (req, res) => {
        const contractId = (req.query.contract as string) || 'ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-spoke';

        res.json({
            timestamp: new Date().toISOString(),
            data: {
                contract: contractId,
                auditScore: '94/100',
                findings: [
                    { severity: 'info', title: 'Admin-only functions properly guarded', detail: 'All admin functions check tx-sender against contract-owner' },
                    { severity: 'info', title: 'Post-conditions enforced', detail: 'STX transfers use strict post-conditions' },
                    { severity: 'low', title: 'No time-lock on admin changes', detail: 'Consider adding a delay for admin key rotation' },
                ],
                passedChecks: [
                    'Reentrancy protection',
                    'Integer overflow/underflow',
                    'Access control',
                    'secp256r1 signature verification',
                    'Replay protection (nonce-based)',
                ],
                recommendation: 'Contract is production-ready with minor suggestions.',
            },
        });
    },
);

// ============================================================================
// Free Endpoints
// ============================================================================

// Health check + service discovery
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'S-VAN x402 Data Provider',
        version: '0.1.0',
        network: STACKS_CAIP2,
        recipient: RECIPIENT,
        verificationMode: HIRO_API_KEY ? 'on-chain (Hiro API)' : 'demo (header-trust)',
        verifiedPayments: getVerifiedTxCount(),
        endpoints: [
            { path: '/api/v1/stx-whales', cost: '100000 microSTX (0.1 STX)', description: 'Whale monitoring' },
            { path: '/api/v1/sbtc-yield', cost: '200000 microSTX (0.2 STX)', description: 'sBTC yield analysis' },
            { path: '/api/v1/clarity-audit', cost: '500000 microSTX (0.5 STX)', description: 'Contract audit' },
        ],
    });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
    console.log(`\n  S-VAN x402 Data Provider`);
    console.log(`  http://localhost:${PORT}\n`);
    console.log(`  Network:      ${STACKS_CAIP2}`);
    console.log(`  Recipient:    ${RECIPIENT}`);
    console.log(`  Verification: ${HIRO_API_KEY ? 'On-chain (Hiro API)' : 'Demo mode (header-trust)'}`);
    console.log(`\n  Paid Endpoints:`);
    console.log(`    GET /api/v1/stx-whales    — 0.1 STX`);
    console.log(`    GET /api/v1/sbtc-yield    — 0.2 STX`);
    console.log(`    GET /api/v1/clarity-audit — 0.5 STX`);
    console.log(`    GET /health               — Free\n`);
});

export default app;

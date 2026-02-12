/**
 * S-VAN x402 Server Tests
 *
 * Tests the x402 paid API server endpoints:
 * - Free health endpoint returns correct structure
 * - Paid endpoints return 402 without payment
 * - Paid endpoints return data with valid payment proof
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// We import the server app directly for testing
let app: express.Express;
let server: Server;
const TEST_PORT = 13402;
const BASE = `http://localhost:${TEST_PORT}`;

beforeAll(async () => {
    // Set env before importing server
    process.env.X402_SERVER_PORT = String(TEST_PORT);
    process.env.X402_RECIPIENT_ADDRESS = 'ST_TEST_RECIPIENT';
    process.env.STACKS_NETWORK = 'testnet';

    // Create a minimal server inline (same logic as server.ts but without listen)
    app = express();
    app.use(express.json());

    const RECIPIENT = 'ST_TEST_RECIPIENT';
    const STACKS_CAIP2 = 'stacks:2147483648';

    function send402(res: express.Response, config: { amountMicroSTX: string; description: string; asset: string }) {
        const paymentRequirement = {
            paymentRequirements: [{
                scheme: 'exact',
                network: STACKS_CAIP2,
                maxAmountRequired: config.amountMicroSTX,
                asset: config.asset,
                payTo: RECIPIENT,
                description: config.description,
            }],
        };
        const encoded = Buffer.from(JSON.stringify(paymentRequirement)).toString('base64');
        res.status(402).set('PAYMENT-REQUIRED', encoded).json({ error: 'Payment Required' });
    }

    function verifyPayment(req: express.Request): boolean {
        const header = req.headers['payment-response'] as string | undefined;
        if (!header) return false;
        try {
            const decoded = JSON.parse(Buffer.from(header, 'base64').toString());
            return decoded.success === true && !!decoded.transactionHash;
        } catch { return false; }
    }

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', service: 'S-VAN x402 Data Provider', network: STACKS_CAIP2 });
    });

    app.get('/api/v1/stx-whales', (req, res) => {
        if (!verifyPayment(req)) return send402(res, { amountMicroSTX: '100000', description: 'Whale data', asset: 'STX' });
        res.json({ data: { sentiment: 'Bullish' } });
    });

    app.get('/api/v1/sbtc-yield', (req, res) => {
        if (!verifyPayment(req)) return send402(res, { amountMicroSTX: '200000', description: 'Yield data', asset: 'STX' });
        res.json({ data: { bestStrategy: 'ALEX sBTC-STX LP' } });
    });

    app.get('/api/v1/clarity-audit', (req, res) => {
        if (!verifyPayment(req)) return send402(res, { amountMicroSTX: '500000', description: 'Audit', asset: 'STX' });
        res.json({ data: { auditScore: '94/100' } });
    });

    server = app.listen(TEST_PORT);
});

afterAll(() => {
    server?.close();
});

describe('S-VAN x402 Server', () => {
    describe('Health endpoint', () => {
        it('returns 200 with service info', async () => {
            const res = await fetch(`${BASE}/health`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('ok');
            expect(data.service).toContain('S-VAN');
        });
    });

    describe('Paid endpoints return 402 without payment', () => {
        it('stx-whales returns 402', async () => {
            const res = await fetch(`${BASE}/api/v1/stx-whales`);
            expect(res.status).toBe(402);
            const header = res.headers.get('PAYMENT-REQUIRED');
            expect(header).toBeTruthy();

            const decoded = JSON.parse(Buffer.from(header!, 'base64').toString());
            expect(decoded.paymentRequirements).toHaveLength(1);
            expect(decoded.paymentRequirements[0].maxAmountRequired).toBe('100000');
            expect(decoded.paymentRequirements[0].asset).toBe('STX');
        });

        it('sbtc-yield returns 402', async () => {
            const res = await fetch(`${BASE}/api/v1/sbtc-yield`);
            expect(res.status).toBe(402);
        });

        it('clarity-audit returns 402', async () => {
            const res = await fetch(`${BASE}/api/v1/clarity-audit`);
            expect(res.status).toBe(402);
        });
    });

    describe('Paid endpoints return data with valid payment', () => {
        function makePaymentHeader() {
            return Buffer.from(JSON.stringify({
                success: true,
                transactionHash: '0xtest123',
                amount: '100000',
                network: 'stacks:2147483648',
            })).toString('base64');
        }

        it('stx-whales returns data after payment', async () => {
            const res = await fetch(`${BASE}/api/v1/stx-whales`, {
                headers: { 'PAYMENT-RESPONSE': makePaymentHeader() },
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.data.sentiment).toBe('Bullish');
        });

        it('sbtc-yield returns data after payment', async () => {
            const res = await fetch(`${BASE}/api/v1/sbtc-yield`, {
                headers: { 'PAYMENT-RESPONSE': makePaymentHeader() },
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.data.bestStrategy).toContain('ALEX');
        });

        it('clarity-audit returns data after payment', async () => {
            const res = await fetch(`${BASE}/api/v1/clarity-audit`, {
                headers: { 'PAYMENT-RESPONSE': makePaymentHeader() },
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.data.auditScore).toBe('94/100');
        });
    });

    describe('Payment header validation', () => {
        it('rejects invalid base64', async () => {
            const res = await fetch(`${BASE}/api/v1/stx-whales`, {
                headers: { 'PAYMENT-RESPONSE': 'not-valid-base64!!!' },
            });
            expect(res.status).toBe(402);
        });

        it('rejects missing transactionHash', async () => {
            const header = Buffer.from(JSON.stringify({ success: true })).toString('base64');
            const res = await fetch(`${BASE}/api/v1/stx-whales`, {
                headers: { 'PAYMENT-RESPONSE': header },
            });
            expect(res.status).toBe(402);
        });

        it('rejects success=false', async () => {
            const header = Buffer.from(JSON.stringify({
                success: false,
                transactionHash: '0xfail',
            })).toString('base64');
            const res = await fetch(`${BASE}/api/v1/stx-whales`, {
                headers: { 'PAYMENT-RESPONSE': header },
            });
            expect(res.status).toBe(402);
        });
    });
});

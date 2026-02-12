/**
 * x402 Middleware Tests
 *
 * Tests the reusable x402 payment middleware:
 * - 402 response format compliance
 * - Payment header parsing and validation
 * - Demo mode (skip on-chain verification)
 * - Cache behavior
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createX402Middleware, clearVerifiedTxCache, getVerifiedTxCount } from '../x402/middleware.js';

let server: Server;
const TEST_PORT = 13403;
const BASE = `http://localhost:${TEST_PORT}`;

beforeAll(() => {
    const app = express();
    app.use(express.json());

    const { requirePayment } = createX402Middleware({
        recipient: 'ST_TEST_ADDR',
        networkCAIP2: 'stacks:2147483648',
        skipOnChainVerification: true,
    });

    app.get('/free', (_req, res) => res.json({ ok: true }));

    app.get(
        '/paid',
        requirePayment({ amount: '100000', asset: 'STX', description: 'Test endpoint' }),
        (_req, res) => res.json({ data: 'premium content' }),
    );

    app.get(
        '/expensive',
        requirePayment({ amount: '500000', asset: 'sBTC', description: 'Expensive endpoint' }),
        (_req, res) => res.json({ data: 'very premium' }),
    );

    server = app.listen(TEST_PORT);
});

afterAll(() => {
    server?.close();
});

beforeEach(() => {
    clearVerifiedTxCache();
});

function makePaymentHeader(overrides: Record<string, unknown> = {}) {
    return Buffer.from(JSON.stringify({
        success: true,
        transactionHash: '0xabc123',
        amount: '100000',
        network: 'stacks:2147483648',
        ...overrides,
    })).toString('base64');
}

describe('x402 Middleware', () => {
    describe('Free endpoints', () => {
        it('are not affected by middleware', async () => {
            const res = await fetch(`${BASE}/free`);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ ok: true });
        });
    });

    describe('402 Response Format', () => {
        it('returns 402 without payment header', async () => {
            const res = await fetch(`${BASE}/paid`);
            expect(res.status).toBe(402);
        });

        it('includes PAYMENT-REQUIRED header', async () => {
            const res = await fetch(`${BASE}/paid`);
            const header = res.headers.get('payment-required');
            expect(header).toBeTruthy();
        });

        it('PAYMENT-REQUIRED header is valid base64 JSON', async () => {
            const res = await fetch(`${BASE}/paid`);
            const header = res.headers.get('payment-required')!;
            const decoded = JSON.parse(Buffer.from(header, 'base64').toString());
            expect(decoded.paymentRequirements).toBeDefined();
            expect(decoded.paymentRequirements).toHaveLength(1);
        });

        it('payment requirement has correct fields', async () => {
            const res = await fetch(`${BASE}/paid`);
            const header = res.headers.get('payment-required')!;
            const decoded = JSON.parse(Buffer.from(header, 'base64').toString());
            const req = decoded.paymentRequirements[0];

            expect(req.scheme).toBe('exact');
            expect(req.network).toBe('stacks:2147483648');
            expect(req.maxAmountRequired).toBe('100000');
            expect(req.asset).toBe('STX');
            expect(req.payTo).toBe('ST_TEST_ADDR');
            expect(req.description).toBe('Test endpoint');
        });

        it('different endpoints have different amounts/assets', async () => {
            const res = await fetch(`${BASE}/expensive`);
            const header = res.headers.get('payment-required')!;
            const decoded = JSON.parse(Buffer.from(header, 'base64').toString());
            const req = decoded.paymentRequirements[0];

            expect(req.maxAmountRequired).toBe('500000');
            expect(req.asset).toBe('sBTC');
        });

        it('402 body includes helpful info', async () => {
            const res = await fetch(`${BASE}/paid`);
            const body = await res.json();
            expect(body.error).toBe('Payment Required');
            expect(body.amount).toBe('100000');
            expect(body.asset).toBe('STX');
            expect(body.recipient).toBe('ST_TEST_ADDR');
        });
    });

    describe('Payment Verification (demo mode)', () => {
        it('accepts valid payment header', async () => {
            const res = await fetch(`${BASE}/paid`, {
                headers: { 'PAYMENT-RESPONSE': makePaymentHeader() },
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.data).toBe('premium content');
        });

        it('rejects missing transactionHash', async () => {
            const res = await fetch(`${BASE}/paid`, {
                headers: { 'PAYMENT-RESPONSE': makePaymentHeader({ transactionHash: undefined }) },
            });
            expect(res.status).toBe(402);
        });

        it('rejects success=false', async () => {
            const res = await fetch(`${BASE}/paid`, {
                headers: { 'PAYMENT-RESPONSE': makePaymentHeader({ success: false }) },
            });
            expect(res.status).toBe(402);
        });

        it('rejects garbage header', async () => {
            const res = await fetch(`${BASE}/paid`, {
                headers: { 'PAYMENT-RESPONSE': '!!!not-base64!!!' },
            });
            expect(res.status).toBe(402);
        });

        it('rejects empty header', async () => {
            const res = await fetch(`${BASE}/paid`, {
                headers: { 'PAYMENT-RESPONSE': '' },
            });
            expect(res.status).toBe(402);
        });
    });

    describe('Cache utilities', () => {
        it('getVerifiedTxCount starts at 0', () => {
            expect(getVerifiedTxCount()).toBe(0);
        });

        it('clearVerifiedTxCache resets count', () => {
            clearVerifiedTxCache();
            expect(getVerifiedTxCount()).toBe(0);
        });
    });
});

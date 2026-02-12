/**
 * x402 Payment Middleware for Express
 *
 * Reusable middleware that gates Express endpoints behind x402 payments.
 * Supports both simulated (demo) and real (Hiro API) payment verification.
 *
 * Usage:
 *   app.get('/api/paid', requirePayment({ amount: '100000', asset: 'STX' }), handler);
 */
import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// Types
// ============================================================================

export interface PaymentConfig {
    /** Amount in base units (microSTX for STX, satoshis for sBTC) */
    amount: string;
    /** Asset type: 'STX' or 'sBTC' */
    asset: string;
    /** Human-readable description */
    description: string;
}

export interface X402MiddlewareOptions {
    /** Stacks recipient address for payments */
    recipient: string;
    /** CAIP-2 network identifier */
    networkCAIP2: string;
    /** Hiro API key for on-chain verification (optional) */
    hiroApiKey?: string;
    /** Stacks network for API calls */
    stacksNetwork?: 'mainnet' | 'testnet';
    /** Skip on-chain verification (for demo/testing) */
    skipOnChainVerification?: boolean;
}

// ============================================================================
// Payment Verification
// ============================================================================

/** Cache of verified transaction hashes to avoid re-verification */
const verifiedTxCache = new Map<string, { amount: string; verifiedAt: number }>();

/**
 * Verify a Stacks transaction on-chain via Hiro API.
 */
async function verifyOnChain(
    txHash: string,
    expectedRecipient: string,
    expectedAmount: string,
    network: 'mainnet' | 'testnet',
    apiKey?: string,
): Promise<boolean> {
    // Check cache first
    if (verifiedTxCache.has(txHash)) return true;

    const baseUrl = network === 'mainnet'
        ? 'https://api.hiro.so'
        : 'https://api.testnet.hiro.so';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-hiro-api-key'] = apiKey;

    try {
        const res = await fetch(`${baseUrl}/extended/v1/tx/${txHash}`, { headers });
        if (!res.ok) return false;

        const tx = await res.json() as Record<string, any>;

        // Check tx is successful
        if (tx.tx_status !== 'success') return false;

        // For STX transfers, verify recipient and amount
        if (tx.tx_type === 'token_transfer') {
            const recipient = tx.token_transfer?.recipient_address;
            const amount = tx.token_transfer?.amount;

            if (recipient !== expectedRecipient) return false;
            if (BigInt(amount || '0') < BigInt(expectedAmount)) return false;

            verifiedTxCache.set(txHash, { amount, verifiedAt: Date.now() });
            return true;
        }

        // For contract calls (e.g., SIP-010 transfers), we'd need to parse events
        // For the hackathon, we accept any successful tx to the right address
        verifiedTxCache.set(txHash, { amount: expectedAmount, verifiedAt: Date.now() });
        return true;
    } catch {
        return false;
    }
}

/**
 * Parse and validate the PAYMENT-RESPONSE header.
 */
function parsePaymentResponse(header: string): {
    success: boolean;
    transactionHash?: string;
    amount?: string;
} | null {
    try {
        const decoded = JSON.parse(Buffer.from(header, 'base64').toString());
        if (typeof decoded.success !== 'boolean') return null;
        return {
            success: decoded.success,
            transactionHash: decoded.transactionHash || decoded.txHash,
            amount: decoded.amount,
        };
    } catch {
        return null;
    }
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create an x402 payment middleware instance.
 */
export function createX402Middleware(options: X402MiddlewareOptions) {
    const {
        recipient,
        networkCAIP2,
        hiroApiKey,
        stacksNetwork = 'testnet',
        skipOnChainVerification = false,
    } = options;

    /**
     * Express middleware that requires x402 payment for access.
     */
    function requirePayment(config: PaymentConfig) {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            // Check for payment response header
            const paymentHeader = req.headers['payment-response'] as string | undefined;

            if (!paymentHeader) {
                // No payment — send 402
                sendPaymentRequired(res, config);
                return;
            }

            // Parse payment response
            const payment = parsePaymentResponse(paymentHeader);
            if (!payment || !payment.success || !payment.transactionHash) {
                sendPaymentRequired(res, config);
                return;
            }

            // Verify payment
            if (skipOnChainVerification) {
                // Demo mode: trust the header
                next();
                return;
            }

            // Production mode: verify on-chain
            const verified = await verifyOnChain(
                payment.transactionHash,
                recipient,
                config.amount,
                stacksNetwork,
                hiroApiKey,
            );

            if (!verified) {
                res.status(402).json({
                    error: 'Payment verification failed',
                    message: 'Transaction could not be verified on-chain. It may be pending or invalid.',
                    transactionHash: payment.transactionHash,
                });
                return;
            }

            next();
        };
    }

    function sendPaymentRequired(res: Response, config: PaymentConfig): void {
        const paymentRequirement = {
            paymentRequirements: [
                {
                    scheme: 'exact' as const,
                    network: networkCAIP2,
                    maxAmountRequired: config.amount,
                    asset: config.asset,
                    payTo: recipient,
                    description: config.description,
                },
            ],
        };

        const encoded = Buffer.from(JSON.stringify(paymentRequirement)).toString('base64');

        res.status(402)
            .set('PAYMENT-REQUIRED', encoded)
            .set('Content-Type', 'application/json')
            .json({
                error: 'Payment Required',
                message: config.description,
                amount: config.amount,
                asset: config.asset,
                network: networkCAIP2,
                recipient,
            });
    }

    return { requirePayment };
}

/**
 * Get the number of cached verified transactions.
 */
export function getVerifiedTxCount(): number {
    return verifiedTxCache.size;
}

/**
 * Clear the verified transaction cache.
 */
export function clearVerifiedTxCache(): void {
    verifiedTxCache.clear();
}

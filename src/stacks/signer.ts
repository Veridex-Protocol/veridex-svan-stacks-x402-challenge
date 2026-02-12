/**
 * Real STX Transaction Signer
 *
 * Uses @stacks/transactions v7 to build, sign, and broadcast
 * real STX transfers on Stacks testnet/mainnet.
 *
 * Supports:
 * - STX native transfers
 * - Transaction status polling via Hiro API
 */
import {
    makeSTXTokenTransfer,
    broadcastTransaction,
} from '@stacks/transactions';

export interface STXTransferParams {
    /** Recipient Stacks address */
    recipient: string;
    /** Amount in microSTX */
    amountMicroSTX: bigint;
    /** Sender's private key (hex, with or without 01 suffix) */
    senderKey: string;
    /** Network: 'mainnet' or 'testnet' */
    network: 'mainnet' | 'testnet';
    /** Optional memo */
    memo?: string;
    /** Optional fee in microSTX (auto-estimated if omitted) */
    fee?: bigint;
}

export interface STXTransferResult {
    success: boolean;
    txId: string;
    error?: string;
}

/**
 * Build, sign, and broadcast a real STX transfer.
 */
export async function sendSTXTransfer(params: STXTransferParams): Promise<STXTransferResult> {
    const { recipient, amountMicroSTX, senderKey, network, memo, fee } = params;

    try {
        const txOptions: any = {
            recipient,
            amount: amountMicroSTX,
            senderKey,
            network,
            memo: memo || 'S-VAN x402 payment',
        };

        if (fee) {
            txOptions.fee = fee;
        }

        const tx = await makeSTXTokenTransfer(txOptions);

        // Broadcast
        const result = await broadcastTransaction({ transaction: tx, network });

        if (typeof result === 'string') {
            return { success: true, txId: result };
        }

        if (result && typeof result === 'object' && 'txid' in result) {
            return { success: true, txId: (result as any).txid };
        }

        const errorMsg = typeof result === 'object' && result !== null
            ? JSON.stringify(result)
            : String(result);
        return { success: false, txId: '', error: errorMsg };
    } catch (error: any) {
        return {
            success: false,
            txId: '',
            error: error.message || String(error),
        };
    }
}

/**
 * Check transaction status via Hiro API.
 */
export async function checkTxStatus(
    txId: string,
    network: 'mainnet' | 'testnet',
): Promise<{ status: string; confirmed: boolean }> {
    const baseUrl = network === 'mainnet'
        ? 'https://api.hiro.so'
        : 'https://api.testnet.hiro.so';

    try {
        const res = await fetch(`${baseUrl}/extended/v1/tx/${txId}`);
        if (!res.ok) return { status: 'not_found', confirmed: false };

        const data = await res.json() as any;
        return {
            status: data.tx_status || 'unknown',
            confirmed: data.tx_status === 'success',
        };
    } catch {
        return { status: 'error', confirmed: false };
    }
}

/**
 * Get STX balance for an address via Hiro API.
 */
export async function getSTXBalance(
    address: string,
    network: 'mainnet' | 'testnet',
): Promise<bigint> {
    const baseUrl = network === 'mainnet'
        ? 'https://api.hiro.so'
        : 'https://api.testnet.hiro.so';

    try {
        const res = await fetch(`${baseUrl}/extended/v1/address/${address}/stx`);
        if (!res.ok) return 0n;
        const data = await res.json() as any;
        return BigInt(data.balance || '0');
    } catch {
        return 0n;
    }
}

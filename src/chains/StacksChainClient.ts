/**
 * S-VAN Stacks Chain Client
 *
 * Re-exports the production StacksChainClient from @veridex/agentic-payments
 * and adds S-VAN-specific helpers for the hackathon demo.
 *
 * The real StacksChainClient provides:
 * - STX/sBTC pricing via Pyth Network
 * - Vault balance queries
 * - Session activity checks
 * - Protocol pause detection
 */
export { StacksChainClient } from '@veridex/agentic-payments';
export { StacksSpendingTracker } from '@veridex/agentic-payments';

/**
 * Stacks testnet preset config for the S-VAN agent.
 * Uses the deployed Veridex contracts on Stacks testnet.
 */
export const SVAN_STACKS_CONFIG = {
    network: 'testnet' as const,
    rpcUrl: 'https://api.testnet.hiro.so',
    spokeAddress: 'ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-spoke',
    vaultAddress: 'ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-vault',
    wormholeVerifier: 'ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-wormhole-verifier',
    vaultVaa: 'ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-vault-vaa',
};

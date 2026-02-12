/**
 * S-VAN: Stacks-Veridex Agent Nexus
 *
 * Main entry point for the autonomous agent that:
 * 1. Initializes a Veridex AgentWallet with spending limits
 * 2. Discovers x402-protected Stacks data APIs
 * 3. Autonomously pays for premium data using session keys
 * 4. Provides market intelligence to the user
 *
 * Uses @veridex/agentic-payments for:
 * - Session key management with spending limits
 * - x402 HTTP payment protocol handling
 * - Stacks-specific spending tracking (STX/sBTC → USD)
 * - Audit logging and compliance export
 */
import 'dotenv/config';
import {
    createAgentWallet,
    AgentWallet,
    StacksSpendingTracker,
    AuditLogger,
} from '@veridex/agentic-payments';
import { SVAN_STACKS_CONFIG } from './chains/StacksChainClient.js';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    dailyLimitUSD: parseFloat(process.env.AGENT_DAILY_LIMIT_USD || '50'),
    perTxLimitUSD: parseFloat(process.env.AGENT_PER_TX_LIMIT_USD || '10'),
    sessionExpiryHours: parseInt(process.env.AGENT_SESSION_EXPIRY_HOURS || '24', 10),
    x402ServerHost: process.env.X402_SERVER_HOST || 'http://localhost:3402',
    network: (process.env.STACKS_NETWORK || 'testnet') as 'mainnet' | 'testnet',
};

// ============================================================================
// S-VAN Agent Class
// ============================================================================

class SVANAgent {
    private wallet: AgentWallet | null = null;
    private spendingTracker: StacksSpendingTracker;
    private auditLogger: AuditLogger;
    private totalSpentMicroSTX = 0n;

    constructor() {
        this.spendingTracker = new StacksSpendingTracker();
        this.auditLogger = new AuditLogger();
    }

    /**
     * Initialize the agent with a Veridex session.
     */
    async init(): Promise<void> {
        console.log('\n🤖 S-VAN Agent Initializing...');
        console.log(`   Daily Limit: $${CONFIG.dailyLimitUSD}`);
        console.log(`   Per-TX Limit: $${CONFIG.perTxLimitUSD}`);
        console.log(`   Network: Stacks ${CONFIG.network}`);
        console.log(`   Contracts: ${SVAN_STACKS_CONFIG.spokeAddress}`);

        // Create agent wallet with spending limits
        // Note: In production, masterCredential comes from a real Passkey.
        // For the hackathon demo, we use a generated credential.
        this.wallet = await createAgentWallet({
            masterCredential: {
                credentialId: 'svan-demo-credential',
                publicKeyX: 0x1n,
                publicKeyY: 0x2n,
                keyHash: '0xsvan_demo_keyhash_000000000000000000000000000000',
            },
            session: {
                dailyLimitUSD: CONFIG.dailyLimitUSD,
                perTransactionLimitUSD: CONFIG.perTxLimitUSD,
                expiryHours: CONFIG.sessionExpiryHours,
                allowedChains: [60], // Stacks Wormhole chain ID
            },
            x402: {
                defaultFacilitator: CONFIG.x402ServerHost,
                paymentTimeoutMs: 30000,
                maxRetries: 2,
            },
        });

        console.log('✅ Agent wallet initialized with session key');
        const status = this.wallet.getSessionStatus();
        console.log(`   Session: ${status.keyHash.slice(0, 16)}...`);
        console.log(`   Remaining budget: $${status.remainingDailyLimitUSD.toFixed(2)}\n`);
    }

    /**
     * Fetch premium data from an x402-protected endpoint.
     * The agent handles 402 responses autonomously.
     */
    async fetchPaidData(endpoint: string): Promise<any> {
        const url = `${CONFIG.x402ServerHost}${endpoint}`;
        console.log(`📡 Requesting: ${url}`);

        try {
            // First, try a direct fetch to see the 402 requirement
            const initialResponse = await fetch(url);

            if (initialResponse.status === 402) {
                // Parse the payment requirement
                const paymentHeader = initialResponse.headers.get('PAYMENT-REQUIRED');
                if (!paymentHeader) {
                    throw new Error('402 response missing PAYMENT-REQUIRED header');
                }

                const requirement = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
                const payReq = requirement.paymentRequirements?.[0];

                if (!payReq) {
                    throw new Error('No payment requirements found');
                }

                console.log(`💰 Payment Required:`);
                console.log(`   Amount: ${payReq.maxAmountRequired} micro${payReq.asset}`);
                console.log(`   Network: ${payReq.network}`);
                console.log(`   Recipient: ${payReq.payTo}`);

                // Check spending limits
                const amountUSD = await this.spendingTracker.estimatePaymentUSD(
                    payReq.maxAmountRequired,
                    payReq.asset
                );
                console.log(`   Estimated: $${amountUSD.toFixed(4)} USD`);

                const status = this.wallet!.getSessionStatus();
                if (amountUSD > status.remainingDailyLimitUSD) {
                    console.log(`❌ Payment rejected: $${amountUSD.toFixed(2)} exceeds remaining budget $${status.remainingDailyLimitUSD.toFixed(2)}`);
                    return null;
                }

                console.log(`✅ Within limits. Authorizing payment...`);

                // Build payment response (simulated settlement for hackathon)
                const paymentResponse = {
                    success: true,
                    transactionHash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
                    amount: payReq.maxAmountRequired,
                    network: payReq.network,
                };

                const paymentResponseEncoded = Buffer.from(JSON.stringify(paymentResponse)).toString('base64');

                // Retry with payment proof
                const paidResponse = await fetch(url, {
                    headers: {
                        'PAYMENT-RESPONSE': paymentResponseEncoded,
                    },
                });

                if (paidResponse.ok) {
                    this.totalSpentMicroSTX += BigInt(payReq.maxAmountRequired);
                    const data = await paidResponse.json();
                    console.log(`✅ Data received! TX: ${paymentResponse.transactionHash.slice(0, 18)}...`);

                    // Log to audit
                    await this.auditLogger.log({
                        txHash: paymentResponse.transactionHash,
                        status: 'confirmed',
                        chain: 60,
                        token: payReq.asset,
                        amount: BigInt(payReq.maxAmountRequired),
                        amountUSD: amountUSD,
                        recipient: payReq.payTo,
                        protocol: 'x402',
                        timestamp: Date.now(),
                    }, status.keyHash);

                    return data;
                } else {
                    console.log(`❌ Payment accepted but data request failed: ${paidResponse.status}`);
                    return null;
                }
            }

            // Free endpoint
            if (initialResponse.ok) {
                return await initialResponse.json();
            }

            console.log(`❌ Request failed: ${initialResponse.status}`);
            return null;
        } catch (error: any) {
            console.error(`❌ Error: ${error.message}`);
            return null;
        }
    }

    /**
     * Run the full S-VAN demo flow.
     */
    async runDemo(): Promise<void> {
        console.log('═══════════════════════════════════════════════════');
        console.log('  S-VAN: Stacks-Veridex Agent Nexus — Demo Flow');
        console.log('═══════════════════════════════════════════════════\n');

        // Step 1: Check server health
        console.log('─── Step 1: Discover Available Services ───\n');
        const health = await this.fetchPaidData('/health');
        if (!health) {
            console.log('\n⚠️  x402 server not running. Start it with: npm run server\n');
            return;
        }
        console.log(`   Found ${health.endpoints?.length || 0} paid endpoints\n`);

        // Step 2: Fetch whale data (0.1 STX)
        console.log('─── Step 2: Fetch STX Whale Data (0.1 STX) ───\n');
        const whaleData = await this.fetchPaidData('/api/v1/stx-whales');
        if (whaleData?.data) {
            console.log(`\n   📊 Whale Intelligence:`);
            console.log(`   Net Flow: ${whaleData.data.netWhaleFlow}`);
            console.log(`   Sentiment: ${whaleData.data.sentiment}\n`);
        }

        // Step 3: Fetch sBTC yield analysis (0.2 STX)
        console.log('─── Step 3: Fetch sBTC Yield Analysis (0.2 STX) ───\n');
        const yieldData = await this.fetchPaidData('/api/v1/sbtc-yield');
        if (yieldData?.data) {
            console.log(`\n   📈 Best Strategy: ${yieldData.data.bestStrategy}`);
            console.log(`   Market: ${yieldData.data.marketCondition}\n`);
        }

        // Step 4: Fetch contract audit (0.5 STX)
        console.log('─── Step 4: Fetch Clarity Audit (0.5 STX) ───\n');
        const auditData = await this.fetchPaidData('/api/v1/clarity-audit');
        if (auditData?.data) {
            console.log(`\n   🔒 Audit Score: ${auditData.data.auditScore}`);
            console.log(`   Recommendation: ${auditData.data.recommendation}\n`);
        }

        // Step 5: Summary
        console.log('─── Summary ───\n');
        const totalSTX = Number(this.totalSpentMicroSTX) / 1_000_000;
        const totalUSD = await this.spendingTracker.stxToUSD(this.totalSpentMicroSTX);
        const status = this.wallet!.getSessionStatus();

        console.log(`   Total Spent: ${totalSTX} STX (~$${totalUSD.toFixed(4)} USD)`);
        console.log(`   Remaining Budget: $${status.remainingDailyLimitUSD.toFixed(2)} USD`);
        console.log(`   Session Valid: ${status.isValid}`);
        console.log(`   Payments Logged: ${(await this.auditLogger.getLogs({ limit: 100 })).length}`);

        // Export audit log
        const auditExport = await this.wallet!.exportAuditLog('json');
        console.log(`\n   📋 Audit Log: ${auditExport.length} bytes exported`);

        console.log('\n═══════════════════════════════════════════════════');
        console.log('  Demo Complete. All payments within session limits.');
        console.log('═══════════════════════════════════════════════════\n');
    }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    const agent = new SVANAgent();
    await agent.init();
    await agent.runDemo();
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

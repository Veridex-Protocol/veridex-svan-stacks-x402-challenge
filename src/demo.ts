/**
 * S-VAN Standalone Demo
 *
 * A simplified demo that shows the x402 flow without requiring
 * the full AgentWallet initialization. Useful for quick testing
 * and hackathon presentations.
 *
 * Usage:
 *   1. Start the server: npm run server
 *   2. Run the demo:     npm run demo
 */
import 'dotenv/config';
import { StacksSpendingTracker } from '@veridex/agentic-payments';

const SERVER = process.env.X402_SERVER_HOST || 'http://localhost:3402';
const tracker = new StacksSpendingTracker();

async function fetchWithX402(endpoint: string): Promise<any> {
    const url = `${SERVER}${endpoint}`;
    console.log(`\n📡 GET ${url}`);

    // Step 1: Initial request
    const res = await fetch(url);

    if (res.status === 402) {
        // Step 2: Parse payment requirement
        const header = res.headers.get('PAYMENT-REQUIRED');
        if (!header) throw new Error('Missing PAYMENT-REQUIRED header');

        const requirement = JSON.parse(Buffer.from(header, 'base64').toString());
        const payReq = requirement.paymentRequirements[0];

        const microSTX = payReq.maxAmountRequired;
        const stx = Number(microSTX) / 1_000_000;
        const usd = await tracker.stxToUSD(BigInt(microSTX));

        console.log(`   💰 402 Payment Required: ${stx} STX (~$${usd.toFixed(4)})`);
        console.log(`   📍 Pay to: ${payReq.payTo}`);
        console.log(`   🌐 Network: ${payReq.network}`);

        // Step 3: Simulate payment (in production, this uses the StacksFacilitatorAdapter)
        const paymentProof = {
            success: true,
            transactionHash: `0x${Date.now().toString(16)}`,
            amount: microSTX,
            network: payReq.network,
        };

        console.log(`   ✅ Payment authorized: ${paymentProof.transactionHash.slice(0, 18)}...`);

        // Step 4: Retry with payment proof
        const paidRes = await fetch(url, {
            headers: {
                'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(paymentProof)).toString('base64'),
            },
        });

        if (paidRes.ok) {
            const data = await paidRes.json();
            console.log(`   ✅ Data received!`);
            return data;
        }

        throw new Error(`Payment accepted but request failed: ${paidRes.status}`);
    }

    if (res.ok) return res.json();
    throw new Error(`Request failed: ${res.status}`);
}

async function main() {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║   S-VAN x402 Demo — Stacks Agent Payments    ║');
    console.log('╚═══════════════════════════════════════════════╝');

    // Check server
    try {
        const health = await fetchWithX402('/health');
        console.log(`\n   Server: ${health.service}`);
        console.log(`   Network: ${health.network}`);
        console.log(`   Endpoints: ${health.endpoints.length} paid`);
    } catch {
        console.error('\n⚠️  Server not running. Start with: npm run server');
        process.exit(1);
    }

    // Fetch all three paid endpoints
    console.log('\n── Whale Data (0.1 STX) ──');
    const whales = await fetchWithX402('/api/v1/stx-whales');
    console.log(`   Sentiment: ${whales.data.sentiment}`);

    console.log('\n── sBTC Yield (0.2 STX) ──');
    const yields = await fetchWithX402('/api/v1/sbtc-yield');
    console.log(`   Best: ${yields.data.bestStrategy}`);

    console.log('\n── Contract Audit (0.5 STX) ──');
    const audit = await fetchWithX402('/api/v1/clarity-audit');
    console.log(`   Score: ${audit.data.auditScore}`);

    // Summary
    const totalMicroSTX = 100000n + 200000n + 500000n;
    const totalUSD = await tracker.stxToUSD(totalMicroSTX);
    console.log(`\n── Summary ──`);
    console.log(`   Total: ${Number(totalMicroSTX) / 1e6} STX (~$${totalUSD.toFixed(4)})`);
    console.log(`   Payments: 3 successful x402 transactions`);
    console.log('\n✅ Demo complete.\n');
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});

/**
 * S-VAN MCP Tools — Stacks Market Intelligence
 *
 * These tools can be registered with the Veridex MCP Server so that
 * AI assistants (Claude, Cursor, etc.) can invoke them directly.
 *
 * Each tool wraps an x402-protected data source, handling payment
 * autonomously via the agent's session key.
 */

export interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Create the S-VAN market intelligence tools.
 *
 * @param fetchPaidData - Function that handles x402 payment and data retrieval
 */
export function createMarketTools(
    fetchPaidData: (endpoint: string) => Promise<any>
): MCPToolDefinition[] {
    return [
        {
            name: 'stx_whale_monitor',
            description: 'Get real-time STX whale activity: top holders, net flow, and sentiment. Costs 0.1 STX via x402.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            handler: async () => {
                const result = await fetchPaidData('/api/v1/stx-whales');
                if (!result?.data) return { error: 'Failed to fetch whale data' };
                return result.data;
            },
        },
        {
            name: 'sbtc_yield_analysis',
            description: 'Analyze sBTC yield opportunities across Stacks DeFi protocols with risk scoring. Costs 0.2 STX via x402.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            handler: async () => {
                const result = await fetchPaidData('/api/v1/sbtc-yield');
                if (!result?.data) return { error: 'Failed to fetch yield data' };
                return result.data;
            },
        },
        {
            name: 'clarity_contract_audit',
            description: 'Run an automated security audit on a Clarity smart contract. Costs 0.5 STX via x402.',
            inputSchema: {
                type: 'object',
                properties: {
                    contract: {
                        type: 'string',
                        description: 'Contract principal (e.g., SP123.my-contract)',
                    },
                },
            },
            handler: async (args) => {
                const contract = (args.contract as string) || '';
                const endpoint = contract
                    ? `/api/v1/clarity-audit?contract=${encodeURIComponent(contract)}`
                    : '/api/v1/clarity-audit';
                const result = await fetchPaidData(endpoint);
                if (!result?.data) return { error: 'Failed to fetch audit data' };
                return result.data;
            },
        },
    ];
}

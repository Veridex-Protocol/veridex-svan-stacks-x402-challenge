/**
 * S-VAN MCP Tools Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { createMarketTools } from '../tools/marketTools.js';

describe('MCP Market Tools', () => {
    const mockFetch = vi.fn();

    const tools = createMarketTools(mockFetch);

    it('creates 3 tools', () => {
        expect(tools).toHaveLength(3);
    });

    it('has correct tool names', () => {
        const names = tools.map((t) => t.name);
        expect(names).toContain('stx_whale_monitor');
        expect(names).toContain('sbtc_yield_analysis');
        expect(names).toContain('clarity_contract_audit');
    });

    describe('stx_whale_monitor', () => {
        it('returns whale data on success', async () => {
            mockFetch.mockResolvedValueOnce({ data: { sentiment: 'Bullish' } });
            const tool = tools.find((t) => t.name === 'stx_whale_monitor')!;
            const result = await tool.handler({});
            expect(result).toEqual({ sentiment: 'Bullish' });
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/stx-whales');
        });

        it('returns error on failure', async () => {
            mockFetch.mockResolvedValueOnce(null);
            const tool = tools.find((t) => t.name === 'stx_whale_monitor')!;
            const result = await tool.handler({});
            expect(result).toEqual({ error: 'Failed to fetch whale data' });
        });
    });

    describe('sbtc_yield_analysis', () => {
        it('returns yield data on success', async () => {
            mockFetch.mockResolvedValueOnce({ data: { bestStrategy: 'ALEX LP' } });
            const tool = tools.find((t) => t.name === 'sbtc_yield_analysis')!;
            const result = await tool.handler({});
            expect(result).toEqual({ bestStrategy: 'ALEX LP' });
        });
    });

    describe('clarity_contract_audit', () => {
        it('passes contract param in URL', async () => {
            mockFetch.mockResolvedValueOnce({ data: { auditScore: '94/100' } });
            const tool = tools.find((t) => t.name === 'clarity_contract_audit')!;
            await tool.handler({ contract: 'SP123.my-contract' });
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/v1/clarity-audit?contract=SP123.my-contract'
            );
        });

        it('works without contract param', async () => {
            mockFetch.mockResolvedValueOnce({ data: { auditScore: '90/100' } });
            const tool = tools.find((t) => t.name === 'clarity_contract_audit')!;
            await tool.handler({});
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/clarity-audit');
        });
    });
});

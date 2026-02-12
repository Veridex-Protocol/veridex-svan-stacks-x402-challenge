# S-VAN: Stacks-Veridex Agent Nexus

**Secure, Autonomous Agentic Payments on Stacks via x402**

## Overview

S-VAN demonstrates how the **Veridex Agent SDK** (`@veridex/agentic-payments`) enables autonomous AI agents to securely pay for premium data on the Stacks blockchain using the **x402 protocol**.

The project has two components:
1. **x402 Data Provider** — An Express server that serves premium Stacks market data behind x402 paywalls
2. **S-VAN Agent** — An autonomous agent that discovers, pays for, and consumes this data using session keys with spending limits

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     S-VAN Agent                         │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ AgentWallet   │  │ Spending     │  │ MCP Tools     │ │
│  │ (Session Keys │  │ Tracker      │  │ (Claude/      │ │
│  │  + Limits)    │  │ (STX→USD)    │  │  Cursor)      │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │                 │                   │         │
│  ┌──────┴─────────────────┴───────────────────┴───────┐ │
│  │          x402 Payment Handler                      │ │
│  │  1. Detect 402 → 2. Check limits → 3. Pay → Retry │ │
│  └────────────────────────┬───────────────────────────┘ │
└───────────────────────────┼─────────────────────────────┘
                            │ HTTP + x402
┌───────────────────────────┼─────────────────────────────┐
│              x402 Data Provider (Express)                │
│                                                         │
│  GET /api/v1/stx-whales    → 0.1 STX                   │
│  GET /api/v1/sbtc-yield    → 0.2 STX                   │
│  GET /api/v1/clarity-audit → 0.5 STX                   │
│  GET /health               → Free                       │
└─────────────────────────────────────────────────────────┘
```

## Key Features

- **Autonomous x402 Handling** — Agent detects `402 Payment Required`, parses STX requirements, and settles payments autonomously
- **Cryptographic Spending Limits** — Session keys with daily/per-tx USD limits via `@veridex/agentic-payments`
- **Stacks-Native Pricing** — Real-time STX/sBTC → USD conversion via Pyth Network oracle
- **MCP Tools** — Market intelligence tools for Claude/Cursor integration
- **Audit Logging** — Every payment is logged and exportable for compliance
- **Post-Conditions** — Stacks protocol-level spending safety (unique to Stacks)

## Tech Stack

- **Agent SDK**: `@veridex/agentic-payments` (session keys, spending limits, x402, audit)
- **Core SDK**: `@veridex/sdk` (Stacks chain client, Passkey auth)
- **Server**: Express 5
- **Runtime**: Node.js + tsx
- **Testing**: Vitest
- **Contracts**: Deployed on Stacks testnet (`ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN`)

## Getting Started

### Prerequisites
- Node.js 20+
- npm or pnpm

### Install

```bash
# From the monorepo root, build the SDK dependencies first
cd packages/sdk && npm run build && cd ../..
cd packages/agent-sdk && npm run build && cd ../..

# Install hackathon project
cd hackathon/stacks-x402-challenge
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your settings (defaults work for local demo)
```

### Run

```bash
# Terminal 1: Start the x402 data provider
npm run server

# Terminal 2: Run the full agent demo
npm start

# Or run the lightweight demo (no AgentWallet required)
npm run demo
```

### Test

```bash
npm test
```

## Project Structure

```
src/
├── index.ts                    # Main S-VAN agent (uses AgentWallet)
├── server.ts                   # x402 paid API server
├── demo.ts                     # Standalone demo script
├── chains/
│   └── StacksChainClient.ts    # Re-exports from @veridex/agentic-payments
├── tools/
│   └── marketTools.ts          # MCP tools for market intelligence
└── __tests__/
    ├── server.test.ts          # x402 server endpoint tests
    └── tools.test.ts           # MCP tools tests
```

## Deployed Contracts (Stacks Testnet)

| Contract | Address |
|----------|---------|
| veridex-spoke | `ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-spoke` |
| veridex-vault | `ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-vault` |
| veridex-wormhole-verifier | `ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-wormhole-verifier` |
| veridex-vault-vaa | `ST1CKNN84MDPCJRQDHDCY34GMRKQ3TASNNDJQDRTN.veridex-vault-vaa` |

## Why S-VAN Wins

- **Real-World Utility** — Solves the security-vs-autonomy trade-off for AI agents
- **Protocol Synergy** — Drives volume to x402-stacks and utility to STX/sBTC
- **Production SDK** — Built on a real, published npm package with 188+ tests
- **Three-Layer Safety** — SDK limits → Contract limits → Stacks Post-Conditions

---
*Built by the Veridex Team for the x402 Stacks Challenge.*

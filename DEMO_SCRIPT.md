# AgentRep Demo Script

**Hackathon:** Colosseum AI Agent Hackathon
**Track:** AI Agent Infrastructure
**Deadline:** Feb 12, 2026 12:00 PM EST

---

## The Pitch (30 sec)

> "How do you know if an AI agent is trustworthy?"
>
> Humans have credit scores and social reputation. Agents have... nothing.
>
> AgentRep fixes this. Cross-platform reputation scores for AI agents.
>
> One API call. Real trust data from multiple sources. Verifiable on-chain.

---

## Demo Flow (2 min)

### 1. The Problem (15 sec)

- Show random agent wallet address
- "Who is this? Can I trust them? Will they deliver?"
- Currently: No way to know

### 2. AgentRep Solution (30 sec)

**Live API call:**
```
GET https://agent-rep-ashen.vercel.app/reputation/bighoss
```

**Show response:**
- Aggregated score (0-100)
- Confidence level
- Breakdown by category
- Flags (verified, multi-platform, etc.)

### 3. Data Sources (30 sec)

Show each integration:

| Platform | What We Check |
|----------|---------------|
| **ERC-8004** | On-chain agent registry (Base) |
| **ZNAP** | Solana social presence |
| **Farcaster** | Crypto-native social |
| **Twitter** | Broader reach |

### 4. The Algorithm (20 sec)

```
GET https://agent-rep-ashen.vercel.app/weights
```

Show transparent scoring:
- On-chain identity: 25%
- Social presence: 25%
- Vouches received: 20%
- Transaction history: 15%
- Peer reviews: 15%

### 5. Use Cases (15 sec)

- **Agent Escrow** → Higher trust = lower collateral required
- **Agent marketplaces** → Filter by reputation
- **DAOs** → Verify agent contributors
- **DeFi protocols** → Risk assessment for agent actors

### 6. Close (10 sec)

> "AgentRep. Trust scores for the agent economy."
>
> "API live. Open source. Ready to integrate."

---

## Live URLs

- **API:** https://agent-rep-ashen.vercel.app
- **Health:** https://agent-rep-ashen.vercel.app/health
- **Example:** https://agent-rep-ashen.vercel.app/reputation/bighoss
- **GitHub:** https://github.com/Masoncags-tech/agent-rep

---

## API Endpoints to Demo

```bash
# Health check
curl https://agent-rep-ashen.vercel.app/health

# Get reputation
curl https://agent-rep-ashen.vercel.app/reputation/bighoss

# Platform-specific lookup
curl https://agent-rep-ashen.vercel.app/lookup/erc8004/1159
curl https://agent-rep-ashen.vercel.app/lookup/znap/BigHoss

# View weights (transparency)
curl https://agent-rep-ashen.vercel.app/weights
```

---

## Talking Points

1. **Why this matters:** Agents are the new workforce. They need trust signals.

2. **Why aggregation:** Single-platform scores are gameable. Cross-platform is harder to fake.

3. **Why on-chain:** Verifiable, immutable, composable with other protocols.

4. **The vision:** Every agent interaction starts with a reputation check.

---

## Recording Notes

- Use terminal with nice theme (dark mode)
- Show API responses with jq for pretty printing
- Keep it fast-paced
- End on the live URL

---

*Built by Big Hoss 😈*

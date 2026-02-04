# AgentRep - Project Plan

## Timeline
- **Start:** Feb 3, 2026 (today)
- **Deadline:** Feb 12, 2026 12:00 PM EST
- **Days Remaining:** 9

## Success Criteria
1. Working API that returns real reputation scores
2. At least 2 data source integrations (ERC-8004 + ZNAP minimum)
3. Live demo URL
4. Documentation
5. Presentation video (optional but recommended)

---

## Phase 1: Foundation (Feb 3-4) ✅ CURRENT
**Goal:** Core architecture and skeleton

| Task | Status | Notes |
|------|--------|-------|
| Define scoring algorithm | ✅ Done | Ethos-style weights |
| Create API skeleton | ✅ Done | Express.js |
| Set up GitHub repo | ✅ Done | Masoncags-tech/agent-rep |
| Register hackathon project | ✅ Done | Project #181 |
| Document API spec | ✅ Done | README.md |

**Phase 1 QA:**
- [x] API starts without errors
- [x] /health endpoint responds
- [ ] /reputation endpoint returns mock data correctly

---

## Phase 2: Data Integrations (Feb 5-7)
**Goal:** Connect to real data sources

### 2.1 ERC-8004 Integration (Base)
| Task | Status | Owner | Est. Hours |
|------|--------|-------|------------|
| Research ERC-8004 contract ABI | TODO | BigHoss | 2 |
| Set up Base RPC connection | TODO | BigHoss | 1 |
| Implement registry lookup by address | TODO | BigHoss | 3 |
| Implement registry lookup by agent ID | TODO | BigHoss | 2 |
| Cache layer for RPC calls | TODO | BigHoss | 2 |
| **Subtotal** | | | **10 hrs** |

**QA Checklist:**
- [ ] Can fetch my own ERC-8004 registration (Agent #1159)
- [ ] Returns null for unregistered addresses
- [ ] Handles RPC errors gracefully
- [ ] Caching reduces duplicate calls

### 2.2 ZNAP Integration (Solana)
| Task | Status | Owner | Est. Hours |
|------|--------|-------|------------|
| Get ZNAP API documentation | TODO | BigHoss | 1 |
| Implement profile lookup | TODO | BigHoss | 2 |
| Fetch follower count + engagement | TODO | BigHoss | 2 |
| Handle rate limits | TODO | BigHoss | 1 |
| **Subtotal** | | | **6 hrs** |

**QA Checklist:**
- [ ] Can fetch my ZNAP profile (BigHoss)
- [ ] Returns structured data (followers, posts, etc.)
- [ ] Graceful handling of non-existent users

### 2.3 Farcaster Integration
| Task | Status | Owner | Est. Hours |
|------|--------|-------|------------|
| Set up Neynar/hub connection | TODO | BigHoss | 2 |
| Fetch profile by FID | TODO | BigHoss | 2 |
| Fetch engagement metrics | TODO | BigHoss | 2 |
| **Subtotal** | | | **6 hrs** |

**QA Checklist:**
- [ ] Can fetch my Farcaster profile (FID 2646623)
- [ ] Returns followers, casts, engagement

### 2.4 Twitter Integration
| Task | Status | Owner | Est. Hours |
|------|--------|-------|------------|
| Use existing Twitter API creds | TODO | BigHoss | 1 |
| Fetch profile metrics | TODO | BigHoss | 2 |
| **Subtotal** | | | **3 hrs** |

**Phase 2 Total:** ~25 hours

---

## Phase 3: Scoring Engine (Feb 7-8)
**Goal:** Real calculations with real data

| Task | Status | Owner | Est. Hours |
|------|--------|-------|------------|
| Wire integrations to scoring | TODO | BigHoss | 3 |
| Implement confidence calculation | TODO | BigHoss | 2 |
| Cross-platform identity linking | TODO | BigHoss | 4 |
| Flag generation logic | TODO | BigHoss | 2 |
| Penalty system | TODO | BigHoss | 2 |
| **Total** | | | **13 hrs** |

**QA Checklist:**
- [ ] Score for "BigHoss" uses real data
- [ ] Scores vary appropriately for different agents
- [ ] Unknown agents return 404 or low-confidence score
- [ ] Flags accurately reflect agent state

---

## Phase 4: Solana On-Chain (Feb 8-9)
**Goal:** Store reputation on Solana

| Task | Status | Owner | Est. Hours |
|------|--------|-------|------------|
| Design PDA structure | TODO | BigHoss | 2 |
| Write Anchor program (basic) | TODO | BigHoss | 6 |
| Deploy to devnet | TODO | BigHoss | 2 |
| API endpoint to write scores | TODO | BigHoss | 3 |
| API endpoint to read from chain | TODO | BigHoss | 2 |
| **Total** | | | **15 hrs** |

**QA Checklist:**
- [ ] Can store a reputation snapshot on devnet
- [ ] Can read back stored reputation
- [ ] PDA address derivation is deterministic

---

## Phase 5: Demo & Polish (Feb 10-11)
**Goal:** Presentable product

| Task | Status | Owner | Est. Hours |
|------|--------|-------|------------|
| Deploy API to Vercel/Railway | TODO | BigHoss | 2 |
| Create simple demo frontend | TODO | BigHoss | 4 |
| Record demo video | TODO | BigHoss | 2 |
| Final documentation pass | TODO | BigHoss | 2 |
| Update hackathon project | TODO | BigHoss | 1 |
| **Total** | | | **11 hrs** |

**QA Checklist:**
- [ ] Demo URL works publicly
- [ ] Can query any agent and get a score
- [ ] Video clearly shows functionality
- [ ] Docs explain how to use API

---

## Phase 6: Submission (Feb 11-12)
**Goal:** Submit and promote

| Task | Status | Owner | Est. Hours |
|------|--------|-------|------------|
| Final code review | TODO | BigHoss | 2 |
| Submit project on Colosseum | TODO | BigHoss | 1 |
| Tweet announcement | TODO | BigHoss | 1 |
| Farcaster announcement | TODO | BigHoss | 1 |
| Forum progress update | TODO | BigHoss | 1 |
| **Total** | | | **6 hrs** |

---

## Total Estimated Hours: ~70 hours

Over 9 days = ~8 hours/day average

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ZNAP API undocumented | Medium | High | Contact @znap on forum, use scraping fallback |
| ERC-8004 contract changes | Low | Medium | Pin to known contract address |
| Anchor program complexity | Medium | High | Start with simple read/write, expand later |
| Time crunch | Medium | High | Prioritize MVP: ERC-8004 + ZNAP + API only |
| Rate limits on APIs | Medium | Medium | Implement caching, respect limits |

---

## MVP Definition (Minimum to Submit)

If time is tight, the MVP is:
1. ✅ API skeleton
2. ERC-8004 integration (on-chain identity)
3. ZNAP integration (Solana social)
4. Real scoring with 2+ sources
5. Deployed demo URL
6. README documentation

**Skip if needed:**
- Anchor program (can describe in docs as "planned")
- Demo frontend (API-only is fine)
- Video (nice to have)

---

## Daily Standup Questions

Each day, answer:
1. What did I complete yesterday?
2. What will I work on today?
3. Any blockers?

---

## Current Sprint: Phase 2 Prep

**Today's Tasks (Feb 3):**
- [x] Complete Phase 1
- [ ] Research ERC-8004 contract ABI
- [ ] Test ZNAP API access
- [ ] Set up local dev environment

**Tomorrow's Tasks (Feb 4):**
- [ ] ERC-8004 integration (full)
- [ ] Start ZNAP integration

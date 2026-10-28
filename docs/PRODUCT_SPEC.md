# Pet Fight — Professional Game Project Specification

**Document type:** Product Requirements + Technical Architecture + Implementation Plan  
**Version:** 1.2  
**Last updated:** 2026-10-27  
**Status:** Draft for engineering  
**Target chain:** Robinhood Chain (EVM-compatible Arbitrum chain; mainnet live since 2026-07-01, gas paid in ETH)  
**Intended development workflow:** Claude models in Cursor  
**Primary goal:** Build a skill-based multiplayer pet battle game with NFTs, progression, equipment, fixed-tier PvP rooms, and an auditable on-chain game economy.

Engineering decisions that refine this draft are locked in [ARCHITECTURE.md](ARCHITECTURE.md), [OPEN_DECISIONS.md](OPEN_DECISIONS.md), and [ROADMAP.md](ROADMAP.md). Where those documents are more specific, they win for implementation. This file stays the product source of truth.

### Changelog

**v1.2 (2026-10-27) — hit zones + deployment cost**

- **New:** head/body hit zones with different damage multipliers (§5.5).
- **New:** smart contract deployment fee prediction and per-match settlement gas budget (§9.6).
- Added the v1.1 review summary and server cost overview to the top of this document.
- Added hit-zone tests (§14) and open decisions (§19).

**v1.1 (2026-10-27) — review update**

- Terminology: PvP "room levels" renamed **stake tiers** to avoid confusion with **pet level**.
- Fixed contradiction between per-species health stats and "same starting health" per round (§5.1).
- Added round draw / turn-limit tie-break rule (§5.1) and fixed-point determinism requirement (§5.4).
- Added XP anti-farming and gas-aware progression storage (§4.2).
- Added fee snapshot + rounding rule (§6.2), ERC-20 approval/permit flow and collusion risk (§6.4).
- Specified EIP-712 typed result signatures, one match per room, and who pays settlement gas (§6.5).
- Updated Robinhood Chain facts: mainnet launch, chain IDs, gas token, finality/confirmation policy (§8.1).
- Added game-rendering library, KMS signer, and region guidance to the stack (§9.1).
- **New:** non-functional requirements (§9.4) and **server infrastructure spec with cost estimates** (§9.5).
- Data model: uint256-safe numeric types, `chain_id`, `fee_bps`, round scores, RNG seed commitment, indexes (§10).
- API: battle actions move to WebSocket; added balances endpoint (§11).
- Added new open decisions (§19).

### Review summary (v1.1)

The v1.0 spec was already strong on security, escrow, and launch gates. The review found these gaps, now fixed in the body of the document:

1. **"Level" meant two things.** Pet level and PvP room level shared one word. Rooms now use **stake tier** everywhere (`stakeTier` in code).
2. **Health contradiction.** Species have different health stats, but the rules said every round starts with the "same health". Each pet now resets to its own max health each round (§5.1).
3. **No draw rule.** Nothing covered simultaneous knockouts or endless rounds. Added a per-round turn limit, health-percentage tie-break, and a full refund for a match-level draw (§5.1).
4. **Replay could break.** Floating-point physics can differ between runtimes. The authoritative engine now uses fixed-point math and a seeded PRNG with a published seed commitment (§5.4).
5. **Settlement gaps.** Results are signed as EIP-712 typed data bound to `chainId` and the contract address (no cross-chain replay); one match per room; the relayer pays gas, but anyone can submit a signed result if the relayer is down (§6.5).
6. **Fees.** `feeBps` is snapshotted at room creation and rounds down in the player's favour; refunds are fee-free (§6.2).
7. **Chip-dumping.** Blocking same-address self-join does not stop one person using two wallets to transfer coins by losing on purpose. Added monitoring and pair limits (§6.4).
8. **Chain facts.** Robinhood Chain mainnet has been live since 1 July 2026, gas is paid in ETH, and third-party docs list chain IDs 4663 (mainnet) / 46630 (testnet). Confirm from official docs before deploying (§8.1).
9. **Data and API.** uint256-safe amounts (`NUMERIC(78,0)`), `chain_id` on every chain row, round scores, seed commitment, indexes; battle actions over WebSocket; new `GET /me/balances` (§10, §11).
10. **Open decisions.** Added gas funding, collusion limits, hosting region, XP rules, and draw rules (§19).

### Server cost at a glance

The game is turn-based, so servers can be small; the limit is open connections, not CPU. Full detail in §9.4–§9.6. Prices are October 2026 list-price estimates.

| Stage | Setup | Approx. cost |
|---|---|---|
| Local development | Laptop + Docker Compose | $0 |
| Prototype / testnet (≤ ~200 players online) | 1 server, 2 vCPU / 4 GB, all services | **≈ $25–50 / month** |
| Controlled beta (≤ ~1,000 online) | 4 vCPU / 8 GB app server + managed Postgres HA + paid RPC | **≈ $160–430 / month** |
| Production (1,000–5,000 online) | 2× 4 vCPU / 8 GB game servers + LB, indexer, managed Postgres + Redis, CDN, monitoring | **≈ $460–1,200 / month** |
| Smart contract deployment (one-time, mainnet) | All 6 contracts + setup transactions | **≈ $1–30 typical; budget ~$150 (0.05 ETH)** — see §9.6 |

Not included: contract audit, legal review, and ongoing settlement gas (§9.6). Hetzner raised cloud prices sharply in June 2026, so it is no longer much cheaper than DigitalOcean at these sizes. If most players are in Asia, host in Singapore or Tokyo; the 15-second turn timer is latency-sensitive.

---

## 1. Executive Summary

Pet Fight is a wallet-connected, multiplayer pet battle game. Each player owns a pet NFT, develops that pet over time, equips it with items, and challenges other players in turn-based battles.

The game combines:

- **On-chain ownership and economy:** pet NFTs, equipment ownership, game-coin balances, staking positions, room escrow, and prize settlement.
- **Off-chain real-time gameplay:** room discovery, matchmaking, battle simulation, wind, projectile trajectories, turn timers, reconnection, and replay data.
- **A hybrid settlement model:** the backend runs the match, records a replayable event transcript, and submits a signed result to a settlement contract. The contract validates the authorized result signer and settles escrow once per match ID.
- **Fixed-cost PvP rooms:** players select a stake tier (10, 20, 50, 100, or 1,000 game coins). Both players lock the same entry amount. The winner receives the combined pool, subject to any explicitly disclosed fee policy.

**Launch principle:** begin with a fun, non-cash testnet prototype. Because redeemable game coins combined with paid-entry matches and winner-takes-pot rewards can trigger gambling, gaming, financial, consumer-protection, tax, and other rules, do not enable real-value wagering or promise redemption until qualified counsel has reviewed the specific jurisdictions and the product has passed security review.

---

## 2. Product Vision and Design Principles

### 2.1 Vision

Create a competitive pet game where players win through aiming, timing, wind management, resource use, and tactical decisions—not simply by buying the strongest pet.

### 2.2 Core principles

1. **Skill first:** paid items and progression must not make competitive matches automatically pay-to-win.
2. **Transparent economy:** show entry cost, total pool, fee (if any), and winner payout before a player commits.
3. **No silent custody:** user assets move only through clearly defined contracts and user-approved transactions.
4. **Server-authoritative combat:** browser clients display the battle but cannot decide authoritative damage, RNG, or winners.
5. **Auditable settlement:** every paid match has a unique ID, immutable rules version, replay transcript, result hash, and one-time settlement.
6. **Fail safely:** cancellation, timeouts, server failure, duplicate transactions, and disputes have documented handling.
7. **Same pet NFT evolves:** growth changes the existing pet’s level/stats/metadata version instead of replacing the pet identity.
8. **MVP before complexity:** launch core combat and testnet rooms before staking, redemption, tournaments, or complex token incentives.

---

## 3. Game Overview

### 3.1 Player journey

1. Connect an EVM wallet.
2. Sign a nonce to authenticate with the game backend.
3. Claim one eligible starter dog NFT.
4. View the pet collection and stats.
5. Buy another pet species or equipment when available.
6. Grow the same pet NFT through gameplay and/or approved in-game actions.
7. Open the PvP lobby.
8. Choose a stake tier: 10, 20, 50, 100, or 1,000 game coins.
9. Create a room or join an existing room at that tier.
10. Lock the entry amount in the escrow contract.
11. Play a best-of-three battle.
12. The backend submits the signed result; the contract settles the prize pool.
13. The frontend displays the result, gross payout, fees, and net profit/loss.
14. The player can view the battle replay and transaction status.

### 3.2 Supported game modes

**MVP**

- Private invite room
- Public room listing
- Fixed-tier head-to-head PvP
- Best-of-three rounds
- Practice mode with no stake / no prize

**Later**

- Ranked season
- Tournaments
- Spectator mode
- Team battles
- Daily missions
- Cosmetic collection events

Do not add paid tournaments or additional prize formats until the core escrow, result validation, anti-cheat, legal, and security models are reviewed.

---

## 4. Pet Species and Combat Identity

Initial species and example base stats are placeholders for balancing, not final values.

| Species | Health | Power | Intelligence | Intended identity |
|---|---:|---:|---:|---|
| Dog | 100 | 70 | 50 | Balanced starter pet |
| Cat | 80 | 55 | 90 | Tactical, high intelligence |
| Pig | 120 | 75 | 45 | Durable, powerful, slower |
| Bird | 65 | 45 | 70 | Evasive, mobile, fragile |

### 4.1 Combat identity

- **Dog:** balanced health and damage.
- **Cat:** stronger tactical resource efficiency, lower health.
- **Pig:** high health and strong attacks, lower intelligence.
- **Bird:** conditional evasion or flight movement, but lower health and damage.

Flight must not grant permanent immunity. Evasion should be limited, telegraphed, and governed by the same server-authoritative rules as other actions.

### 4.2 Progression rules

- The pet keeps the same NFT token ID as it levels up.
- Progression updates on-chain stats or a verified progression record and increments a metadata version.
- Equipment is owned separately from the pet, unless a later design deliberately uses a different standard.
- Competitive stat bonuses must be capped and visible.
- Consider a normalized ranked mode where pets have equalized competitive stats; allow full progression in casual modes.
- **Gas-aware storage:** store only compact progression data on-chain (species, level, XP checkpoint, metadata version). Derive the full stat block from `level` + species + the versioned rules config, rather than writing every stat on each level-up.
- **Anti-farming:** XP from PvP must not be farmable by playing against your own second wallet. Apply daily XP caps, reduced XP for repeat opponents, and no XP for matches that end by early forfeit. Practice mode grants no (or capped) XP.
- Progression writes are batched (e.g., the player claims accumulated XP in one transaction), not sent after every match.

### 4.3 Starter pet

- One starter dog per eligible wallet, subject to documented anti-abuse rules.
- Wallet-based limits are not strong Sybil protection by themselves.
- Do not promise that one wallet equals one human.
- Starter issuance should be controlled by the contract and an auditable eligibility mechanism.

---

## 5. Battle Rules

### 5.1 Match format

- One match consists of best-of-three rounds.
- First player to win two rounds wins the match.
- Each round resets both pets to their own maximum health (derived from species, level, and equipment under the match's `rulesVersion`) and to the starting Intel Energy. Starting health may therefore differ between pets; it does not differ between rounds.
- In normalized/ranked mode (if adopted), both pets use the same equalized stat block.
- **Turn limit and draws:** each round has a maximum turn count (proposed: 20 turns per player). If the limit is reached, the pet with the higher remaining health **percentage** wins the round. If both pets reach 0 health on the same resolution step, or percentages are exactly equal, the round is a draw and is replayed once; a second draw makes the round void and play continues to the next round. If the match cannot produce a winner within 5 rounds, the match is a draw and both deposits are refunded (see §6.6).
- A match uses a fixed `rulesVersion`; changes to game balance must not retroactively alter a running match.
- Each turn has a configurable timeout, initially proposed at 15 seconds.
- Reconnection is supported for a documented grace period.
- The backend stores an append-only event transcript sufficient to reproduce the match.

### 5.2 Turn actions

Possible actions:

- Normal throw
- Power shot
- Sniping shot
- Double attack
- Heal
- Species-specific ability
- Pass / timeout action

Each action must be validated server-side for:

- Correct player turn
- Valid action type
- Sufficient Intel Energy
- Valid power/angle range
- Cooldowns
- Pet state and health
- Turn deadline
- Current `rulesVersion`

### 5.3 Intel Energy

An illustrative prototype may begin each round with 100 Intel Energy. Energy costs and action damage are tuning parameters and must be centrally defined in a versioned rules configuration. The server and any on-chain result verifier must agree on the applicable rules version.

Illustrative values for early testing only:

| Action | Example effect | Example energy cost |
|---|---|---:|
| Normal throw | 15 damage baseline | 0 |
| Double attack | Two lower-damage attacks | 25 |
| Sniping shot | Precision damage | 30 |
| Power shot | Higher damage | 35 |
| Heal | Restore 15 health | 40 |

These values are not final and must be tested through simulations and playtests. Prevent unlimited loops, runaway healing, and dominant strategies.

Damage values in this table are the **body-hit baseline**. The final damage depends on where the shot lands (see §5.5).

### 5.4 Physics, wind, and randomness

- Players choose throw power and angle within allowed ranges.
- Wind changes the projectile trajectory.
- Each round’s wind and random events must be generated by a defined, auditable process.
- Never accept client-submitted damage or winner values as authoritative.
- Record the random seed/proof and every input needed to replay the match.
- Commit-reveal may be considered, but participant aborts and withheld reveals must be addressed. It is not automatically a complete fairness solution.
- For valuable matches, consider deterministic simulation plus a verifiable randomness source or a stronger proof/verification model after the MVP.
- **Determinism:** the simulation must use integer / fixed-point math (e.g., values scaled by 1,000) and a seeded PRNG implemented in the shared `game-engine` package. Do not use `Math.random()` or floating-point trigonometry in authoritative code, because floating-point results can differ across runtimes and break replay verification.
- **Seed commitment:** before round 1, the server publishes `hash(serverSeed)` to both players; after the match it reveals `serverSeed`. Mixing in each player's per-match client seed lets players verify the server did not choose wind after seeing their inputs.
- The client may run the same engine for visual prediction, but the server result always wins.

### 5.5 Hit zones (head vs. body)

Shots do different damage depending on which part of the pet they hit. The **head is a weak point**: for the same throw power, a head hit does more damage than a body hit. The head is also a smaller target, so aiming for it is a risk/reward choice, made harder by wind.

#### Zones and multipliers

| Zone | How it is hit | Damage multiplier (initial, tunable) |
|---|---|---:|
| **Head** | Projectile's first contact is inside the head hitbox | **1.5×** |
| **Body** | First contact is inside the body hitbox | 1.0× (baseline) |
| **Splash** | No direct hit, but impact point is within the splash radius of the pet | 0.5× |
| **Miss** | Outside the splash radius | 0 |

Example with the 15-damage normal throw at the same power: head **22**, body **15**, splash **7** (results are rounded down).

Action-specific overrides (optional, set in the rules config):

- **Sniping shot:** head multiplier 1.8× — this is its identity as the precision shot.
- **Power shot:** head multiplier 1.3× — already high damage, so the head bonus is smaller to avoid one-shots.
- **Double attack:** each hit resolves its zone independently.

#### Damage formula

```text
damage = floor( baseDamage(action, power)
              × statFactor(attacker.power)
              × zoneMultiplier(zone, action)
              × (1 − zoneDefense(defender, zone)) )
damage = min(damage, maxSingleHit)            // maxSingleHit = 40% of defender max health
```

- All factors are fixed-point integers in the authoritative engine (§5.4).
- **One-shot cap:** no single hit may deal more than 40% of the defender's max health, so a lucky power-shot headshot cannot end a round instantly.
- **Zone defense from equipment:** e.g., a helmet reduces head damage (head multiplier 1.5× → 1.3×). Bonuses are capped, visible in the pet's stat panel, and stored in the equipment catalogue (§8.2).

#### Hitbox shapes per species

Each pet has two hitboxes defined in the rules config (fixed-point units, relative to the pet's position). Head area should be roughly **25–35% of the total target area**, so head-aiming is rewarding but not always the dominant choice.

| Species | Head hitbox | Body hitbox | Design intent |
|---|---|---|---|
| Dog | Medium | Medium | Balanced |
| Cat | Small | Small–medium | Hard to headshot; fits its low health |
| Pig | Large | Large | Easy to hit, offset by high health |
| Bird | Very small | Small | Hardest target; offset by lowest health |

Values are placeholders and must be tuned with simulations (e.g., hit rate per zone at various wind speeds).

#### Resolution rules (server-authoritative)

1. Simulate the trajectory in fixed time steps.
2. At each step, test the projectile against both hitboxes. The **first contact point along the path** decides the zone.
3. If the head and body are touched in the same step, the earlier contact point wins; an exact tie counts as **body** (the conservative choice).
4. Bird evasion (if triggered) is resolved before the zone check.
5. Record the zone, contact point, multiplier, and final damage in the battle transcript so the replay shows exactly why the damage happened.

#### UI

- Show a "HEADSHOT" label and larger damage number on head hits.
- Show the outline of the head/body hitboxes in practice mode and in replays so players can learn them.
- The aiming preview must **not** show the exact landing zone; otherwise the skill element disappears.

---

## 6. Fixed-Tier PvP Room Economy

This is a core feature.

### 6.1 Stake tiers

> Terminology: a room's **stake tier** is the entry amount. It is unrelated to a **pet's level**. Use `stakeTier` in code, never `level`.

The initial stake tiers are fixed:

- 10 game coins
- 20 game coins
- 50 game coins
- 100 game coins
- 1,000 game coins

The room creator selects one tier when creating the room. The joining player must pay the exact same tier. Do not allow either player to change the stake after the room is funded.

Tiers are stored on-chain as an allow-list. Adding or removing a tier is an admin action behind the timelock and never affects rooms already created.

### 6.2 Example: 20-coin room

1. Player A creates a room at the 20-coin level.
2. Player A locks 20 game coins in the escrow contract. The coins are pending; they are not paid to the host.
3. Player B joins and locks 20 game coins.
4. The contract now holds a total prize pool of 40 game coins.
5. The match begins only after both deposits are confirmed and the room state is `READY`.
6. Player A wins.
7. The settlement contract releases 40 game coins to Player A, less any explicitly configured and disclosed fee.
8. Player B receives no prize and loses the 20-coin entry amount.
9. Player A’s net result before fees is +20 coins; Player B’s net result is −20 coins.

If there is no fee, the winner receives the full 40-coin pot. If a fee is later introduced, show it in the lobby before either player commits. Never describe a payout as 40 coins if a fee will reduce the actual amount received.

**Fee rules (if a fee is ever enabled):**

- Fee is expressed in basis points (`feeBps`, e.g., 500 = 5%) with a hard-coded maximum in the contract.
- `feeBps` is **snapshotted into the room at creation**. Later fee changes apply only to new rooms.
- `fee = pot * feeBps / 10_000` (integer division, rounds down in the player's favour); `payout = pot - fee`. Example: 40-coin pot at 5% → fee 2, payout 38, winner net +18.
- Refunds (cancel, expire, draw) are always fee-free.

### 6.3 Required room states

Use an explicit state machine:

- `CREATED`: room metadata created; no match can start.
- `HOST_FUNDED`: host escrow deposit confirmed.
- `READY`: opponent deposit confirmed; both players and exact stake locked.
- `IN_PROGRESS`: backend has started the match.
- `RESULT_PENDING`: battle ended; result submitted or awaiting verification.
- `SETTLED`: prize paid exactly once.
- `CANCELLED`: room cancelled under an allowed rule; eligible deposits refunded.
- `DISPUTED`: a defined validation or service issue requires review.
- `EXPIRED`: room or match exceeded a documented deadline and is eligible for refund/recovery handling.

Transitions must be enforced by contract logic where funds are involved. The backend may coordinate state, but it must not be able to arbitrarily take escrowed user funds.

### 6.4 Room creation and joining

**Create room**

- User selects a fixed level.
- Frontend shows the exact amount and contract.
- User approves/deposits the exact amount. Prefer EIP-2612 `permit` on PETC so create+deposit is a single transaction; otherwise request an `approve` for the **exact** tier amount, never an unlimited allowance.
- The host also selects which pet NFT will fight; that pet (and its equipped items) is locked for the room's lifetime (see §19 item 7).
- Contract records host, stake tier, amount, `feeBps` snapshot, timestamp/deadline, and unique room ID.
- Public rooms appear in the lobby after confirmation.
- Private rooms are visible only through an invite flow, but privacy is not a security boundary.

**Join room**

- Validate room is joinable, not expired, and not created by the same address if self-play is disallowed.
- Joining player deposits the exact same amount.
- The contract rejects mismatched token, amount, room state, or duplicate join.
- Match starts only after the join deposit is confirmed and the backend confirms both players are ready.

**Collusion and chip-dumping.** Blocking same-address self-join does not stop one person from controlling two wallets and moving coins between them by deliberately losing. Monitor for repeated pairings, abnormally short matches, and intentional idling; consider limits on repeated matches between the same pair per day, and flag patterns for review rather than silently confiscating funds.

### 6.5 Settlement

The result submission must contain or reference:

- Unique `matchId`
- `roomId`
- `rulesVersion`
- Player addresses
- Winner address
- Final score / rounds won
- Transcript hash
- Result hash
- Authorized server signature
- Relevant timing or expiry fields

The contract must:

- Verify the signer is currently authorized.
- Verify the match exists and is in a settleable state.
- Verify the winner is one of the two participants.
- Verify both deposits were made and the expected pot is present.
- Reject duplicate settlement for the same match.
- Pay the prize exactly once.
- Record settlement status and result hash.
- Apply only a fee that was disclosed and configured before funding.

**Signature format.** Results are signed as **EIP-712 typed data**. The domain separator must include the contract name, version, `chainId`, and `verifyingContract`, so a signature for testnet or another deployment can never be replayed on mainnet. The struct includes a `deadline`; expired results are rejected.

**One match per room.** The MVP uses exactly one match per funded room, so `matchId` is derived from `roomId` (e.g., `matchId = keccak256(roomId, 1)`). Rematches create a new room.

**Who submits and pays gas.** The settlement service (relayer) submits the result and pays the ETH gas. Because the signed result is public, **anyone** (including either player) may also submit it; this keeps settlement possible if the relayer is down. Budget relayer gas as an operating cost and alert when its balance is low.

**Critical limitation:** an authorized backend signer is a trust assumption. It is not proof that the backend reported a fair result. Reduce this risk with replayable transcripts, deterministic simulation, independent monitoring, dispute handling, and eventually stronger verification. Never market a signed server result as trustless.

### 6.6 Cancellation, timeout, and failure rules

Define these before mainnet:

- **Opponent never joins:** host can cancel after the room expiry; refund the host’s full deposit.
- **Host cancels before opponent joins:** refund the host.
- **Both deposits confirmed but match never starts:** allow a safe timeout/refund path if no valid match has begun.
- **Player disconnects:** apply a published reconnect grace period and forfeit rule; avoid letting the backend arbitrarily confiscate funds.
- **Backend unavailable:** funds must not become permanently trapped. A time-based escape/refund path should exist for appropriate states.
- **Draw or invalid result:** follow the deterministic rule in §5.1; a match-level draw refunds both deposits in full.
- **Duplicate result submission:** reject it; settlement must be idempotent.
- **Contract pause:** stop new rooms and new deposits; do not casually block valid user withdrawals/refunds without an explicit emergency policy.
- **Dispute:** define evidence, response deadlines, and whether the contract has any timeout fallback. Do not add unrestricted admin discretion over prizes.

### 6.7 Economic reporting

The lobby and result screen should show:

- Selected stake tier
- Host deposit status
- Opponent deposit status
- Total pool
- Platform fee, if any
- Expected winner payout
- Match state
- Settlement transaction status
- Winner’s gross payout and net profit
- Loser’s entry amount and net loss

The UI must distinguish **pending/locked**, **settled**, and **available balance**. Never display locked coins as spendable.

---

## 7. Game Coin and Redemption Model

The game coin is referred to as `PETC` in this specification; rename it if required.

### 7.1 Recommended separation

Use separate contracts/modules for:

- `PETC`: ERC-20 game coin.
- `PetNFT`: ERC-721 pet ownership.
- `PetEquipment`: ERC-1155 equipment and consumables.
- `GameTreasury`: purchases, redemption policy, and reserve accounting.
- `StakingVault`: staking of a separate special token.
- `BattleEscrow` or `BattleSettlement`: PvP room deposits and prize settlement.

Do not mix staking principal, game-operating funds, and redemption reserves in one unrestricted treasury balance.

### 7.2 Redeemable coin reserve invariant

If PETC is redeemable at a fixed rate `r` coins per ETH, and `S` is the total outstanding redeemable PETC supply, the gross ETH liability is:

`L = S / r`

A minimum reserve condition is:

`R >= L + other payable liabilities`

where `R` is the ETH held in the dedicated redemption reserve. Account for pending redemptions and any other obligations consistently. Fees do not substitute for reserve assets. A reserve dashboard should show the method, last update, and relevant limitations.

If the reserve is underfunded, do not promise guaranteed immediate redemption. Define a transparent emergency policy and get legal advice before launch.

### 7.3 Staking token

The “special token” used for staking should be distinct from PETC. Staking can provide:

- Reduced platform fees, if legal and economically sustainable
- Access to cosmetics or rooms
- Higher non-financial usage limits
- Seasonal benefits

Do not promise staking yield unless there is a separately defined and funded source of yield. Staked tokens do not count as ETH redemption reserves. Publish lock periods, unstaking rules, slashing policy (if any), and contract risks.

### 7.4 Legal and compliance launch gate

A redeemable token plus entry-fee PvP and winner-takes-pot payouts may be treated as wagering or gambling in some jurisdictions, even if the game includes skill. Token sale, redemption, staking, prize, consumer-protection, sanctions, tax, and age/access rules may also apply.

Before real-value matches:

- Obtain jurisdiction-specific legal advice.
- Define permitted locations and eligibility.
- Decide whether paid-entry matches may be offered at all.
- Review advertising and payout language.
- Establish terms, privacy notice, dispute process, and responsible-play controls as applicable.
- Use testnet-only or non-redeemable test currency until cleared.
- Do not imply legal approval merely because the contracts work.

This document is a technical specification, not legal advice.

---

## 8. On-Chain Architecture

### 8.1 Chain configuration

Target Robinhood Chain, an EVM-compatible network. Keep chain settings in environment/configuration rather than hard-coding them throughout the app. Confirm the current official chain ID, RPC, explorer, token deployment addresses, and wallet support from official documentation before deployment. Use testnet first and a reliable RPC provider for production.

Known facts as of October 2026 (re-verify against official docs before each deployment):

| Item | Value |
|---|---|
| Architecture | Dedicated Arbitrum (Nitro) chain settling to Ethereum |
| Public testnet | Opened February 2026 |
| Mainnet | Live since 1 July 2026 |
| Gas token | ETH |
| Mainnet chain ID | `4663` (per third-party RPC provider docs) |
| Testnet chain ID | `46630` (per third-party RPC provider docs) |
| Explorer | Blockscout (`robinhoodchain.blockscout.com`) |
| RPC | Official public RPC for development; a paid provider (e.g., Chainstack, GetBlock, Dwellir) for production |

**Confirmation policy.** The chain offers fast sequencer preconfirmations, which are not the same as finality on Ethereum. Define per action:

- **Room deposits (start a match):** accept after the transaction is included in a sequencer block and seen by the indexer; this is low-risk because funds stay in escrow.
- **Settlement and redemption bookkeeping:** treat as final only after the batch is posted to Ethereum (or a documented confirmation depth). The indexer must handle reorgs/re-sequencing idempotently.

Official starting points:

- Robinhood Chain docs: https://docs.robinhood.com/chain/
- Connecting to the chain: https://docs.robinhood.com/chain/connecting/
- Deploy smart contracts: https://docs.robinhood.com/chain/deploy-smart-contracts/
- OpenZeppelin Contracts: https://docs.openzeppelin.com/contracts
- Solidity security considerations: https://docs.solidity.org/en/latest/security-considerations.html

### 8.2 Contract responsibilities

#### `PetCoin.sol`

- ERC-20 PETC token.
- Minting must be limited to the approved issuance/economic model.
- If purchase-and-burn is used, enforce it through authorized contract flows.
- Do not provide an unrestricted owner mint function on mainnet.
- Add supply caps or issuance constraints where appropriate.

#### `PetNFT.sol`

- ERC-721 pet NFT.
- Mint eligible starter pets.
- Sell approved species through an explicit price/catalogue mechanism.
- Track species, level, progression, and metadata version, or link to a verified progression system.
- Keep upgrade logic permissioned and auditable.
- Avoid arbitrary backend ability to transfer user-owned NFTs.

#### `PetEquipment.sol`

- ERC-1155 stackable equipment/consumables.
- Use an approved catalogue and explicit stat modifiers.
- Ensure consumable usage is validated by the game rules.
- Avoid hidden competitive bonuses.

#### `GameTreasury.sol`

- Buy PETC under the published rate/purchase policy.
- Burn or lock PETC during redemption.
- Transfer ETH only under the documented reserve rules.
- Separate reserve accounting from operating revenue.
- Emit events for purchases, redemptions, fees, and reserve changes.
- Avoid arbitrary treasury withdrawals that can violate reserve coverage.

#### `StakingVault.sol`

- Stake and unstake the special token.
- Track each wallet’s stake and lock period.
- Expose eligibility/tiers to the game.
- Do not use staked principal as redemption reserve.
- Avoid adding yield in the MVP.

#### `BattleEscrow.sol` / `BattleSettlement.sol`

- Create fixed-tier rooms.
- Accept host and opponent deposits.
- Lock exactly the approved entry amount.
- Track room/match states.
- Submit and verify authorized match results.
- Settle the pot once.
- Refund eligible cancellations/expirations.
- Prevent replay and reentrancy.
- Emit complete events for indexing and audit.

### 8.3 Contract security baseline

- Use audited OpenZeppelin primitives where appropriate.
- Follow checks-effects-interactions.
- Use reentrancy protection for relevant external calls.
- Apply least-privilege roles.
- Use multisig for critical admin roles.
- Use timelocks for sensitive parameter changes where practical.
- Add emergency pause controls with a clear policy.
- Do not allow the admin to change a funded room’s stake or payout terms.
- Do not allow result signers to withdraw funds directly.
- Use unique room/match IDs and replay protection.
- Add unit, fuzz, invariant, and integration tests.
- Independently audit contracts before real-value launch.

---

## 9. Backend Architecture

### 9.1 Suggested stack

- **Frontend:** Next.js + TypeScript.
- **Battle rendering:** Phaser 3 or PixiJS inside the Next.js app (canvas/WebGL); the renderer only animates server state.
- **Wallet/EVM:** wagmi + viem or a compatible wallet stack.
- **Smart contracts:** Solidity + Foundry + OpenZeppelin.
- **Backend:** Node.js + TypeScript, using NestJS or Fastify.
- **Database:** PostgreSQL.
- **Cache / room coordination:** Redis.
- **Realtime:** WebSockets.
- **Metadata:** IPFS or another content-addressed storage provider.
- **Deployment:** containerized services; separate development, testnet, and production environments.
- **Monitoring:** structured logs, error tracking, metrics, alerting, and chain-event reconciliation.
- **Result signer:** a cloud KMS key that supports secp256k1 (e.g., AWS KMS or Google Cloud KMS); the private key never leaves the KMS.
- **Hosting region:** place game servers close to the main player base (e.g., Singapore or Tokyo for East/Southeast Asia) because turn timers are latency-sensitive.

### 9.2 Services/modules

1. **Auth service:** wallet nonce, signature verification, session issuance.
2. **Pet service:** pet inventory read models, progression, metadata.
3. **Room service:** public/private room discovery and room state.
4. **Match service:** authoritative battle state machine.
5. **Simulation engine:** deterministic physics, damage, wind, energy, RNG inputs.
6. **Settlement service:** result transcript/hash, authorized signature, on-chain submission.
7. **Chain indexer:** consumes contract events and reconciles database state.
8. **Economy service:** prices, reserve display, purchases/redemptions, coin history.
9. **Staking service:** reads staking position and benefit eligibility.
10. **Admin/operations:** controlled configuration, monitoring, incident workflow; no unrestricted custody powers.

### 9.3 Backend must never

- Ask for or store user private keys.
- Trust a wallet address without signature verification.
- Trust client-submitted damage, health, RNG, or winner.
- Mark an on-chain deposit confirmed based only on a frontend callback.
- Pay a prize before validating the room/match state and result.
- Settle the same match twice.
- Change a room’s terms after deposits are locked.
- Silently edit or delete battle events relevant to a dispute.

### 9.4 Non-functional requirements

| Requirement | MVP / beta target | Launch target |
|---|---|---|
| Concurrent players online (CCU) | 200–1,000 | 1,000–5,000 |
| Concurrent matches | 100–500 | 500–2,500 |
| Action → state broadcast latency (server side) | < 100 ms p95 | < 100 ms p95 |
| Player round-trip latency in target region | < 150 ms | < 150 ms |
| API availability | best effort | 99.5% monthly |
| Settlement submitted after match end | < 60 s | < 30 s |
| Match recovery after game-server restart | match resumes from transcript | match resumes from transcript |
| Database backups | daily | daily + point-in-time recovery |

Workload notes: the game is turn-based, so each match sends only a few small WebSocket messages per turn (one action every ~15 s, plus timer/state updates). CPU per match is tiny; the real limits are open WebSocket connections, Redis/Postgres writes for transcripts, and RPC calls from the indexer. The game server must keep match state in Redis (or replay it from `battle_events`) so a restart or a second instance can resume matches.

### 9.5 Server infrastructure specification and cost estimates

Prices are approximate list prices checked in October 2026 (USD per month, DigitalOcean used as the reference; Hetzner shown as an alternative). Treat them as budgeting estimates and re-check before purchasing. Taxes, bandwidth overage, and domain/SSL are excluded.

#### Tier A — Local development (Phases 0–1)

- Developer laptop with Docker Compose: Postgres, Redis, API, game server, local chain (Anvil).
- **Cost:** $0.

#### Tier B — Prototype / testnet (Phases 2–5, up to ~200 CCU)

All services on one VM via Docker Compose.

| Component | Spec | Approx. cost |
|---|---|---|
| App VM (web API, game server, indexer, Postgres, Redis) | 2 vCPU / 4 GB RAM / 80 GB SSD | $24 (DO Basic) or ~€19.49 (Hetzner CPX22, EU) |
| Frontend | Vercel / Netlify free tier or served from the VM | $0 |
| RPC | Official testnet RPC or provider free tier | $0 |
| Backups | VM snapshots / weekly backups | ~$5 |
| Error tracking / uptime | Free tiers (e.g., Sentry, UptimeRobot) | $0 |
| **Total** | | **≈ $25–50 / month** |

#### Tier C — Controlled beta (Phase 6, up to ~1,000 CCU)

| Component | Spec | Approx. cost |
|---|---|---|
| App VM (API + game server + indexer) | 4 vCPU / 8 GB RAM | $48 |
| Managed PostgreSQL (HA: primary + standby) | 2 GB RAM | $60 |
| Redis | Self-hosted on app VM, or small managed instance | $0–15 |
| RPC provider | Paid entry plan | ~$50–250 (varies by provider/usage) |
| KMS signer key | 1 secp256k1 key | ~$1–5 |
| Relayer gas | ETH for settlement transactions | usage-based; keep a monitored float |
| Monitoring / logs | Free or starter tiers | $0–50 |
| **Total** | | **≈ $160–430 / month** |

#### Tier D — Production launch (Phase 7, 1,000–5,000 CCU)

| Component | Spec | Approx. cost |
|---|---|---|
| Game/API servers ×2 behind a load balancer (WebSocket sticky sessions) | 4 vCPU / 8 GB RAM each | $96 + ~$12 LB |
| Indexer + settlement worker | 2 vCPU / 4 GB RAM | $24 |
| Managed PostgreSQL HA with point-in-time recovery | 4–8 GB RAM, primary + standby | ~$120–260 |
| Managed Redis | 1–2 GB, HA | ~$30–60 |
| Frontend hosting / CDN | Vercel Pro or equivalent | ~$20–50 |
| RPC provider | Production plan with failover endpoint | ~$100–500 |
| Monitoring, logs, error tracking | Paid tiers | ~$50–150 |
| KMS, secrets manager, backups storage | | ~$10–30 |
| **Total** | | **≈ $460–1,200 / month** |

Scale-out rule: add another 4 vCPU / 8 GB game server for roughly every additional 2,000–3,000 CCU, once load tests confirm the per-node capacity. Run load tests before relying on any of the CCU figures above.

#### One-time and non-server costs (not included above)

- Smart contract audit before real-value launch: obtain quotes; cost depends heavily on code size and auditor.
- Legal/compliance review (§7.4).
- Contract deployment gas on Robinhood Chain — see §9.6.
- Domain, email, and any paid design/art assets.

### 9.6 Smart contract deployment fee and on-chain gas budget (prediction)

These are **predictions**, not quotes. Real cost depends on final contract size, the gas price at deployment time, Ethereum L1 data costs, and the ETH price. Re-estimate with `forge script --estimate` / `cast estimate` once the contracts compile.

#### How fees work on Robinhood Chain

- Fees are paid in **ETH**.
- Each transaction pays an **L2 execution fee** (gas used × L2 gas price) plus an **L1 data fee** for posting its data to Ethereum. Contract deployment has large calldata (the bytecode), so the L1 part matters more than for normal transactions.
- Observed L2 gas price in 2026: a floor of **0.02 gwei**; ~0.04–0.12 gwei in July–August; a spike to ~0.5 gwei (early September daily average) and up to roughly 80× the floor at peak; fees then fell back sharply by mid-September.
- Assumed ETH price for the estimates below: **≈ $2,725** (early October 2026).

#### Estimated gas per contract (with optimizer, OpenZeppelin base contracts)

| Contract | Estimated deploy gas |
|---|---:|
| `PetCoin` (ERC-20 + permit + roles) | ~1.3M |
| `PetNFT` (ERC-721 + catalogue + progression) | ~3.0M |
| `PetEquipment` (ERC-1155 + catalogue) | ~2.5M |
| `GameTreasury` | ~1.8M |
| `StakingVault` | ~1.5M |
| `BattleEscrow` (EIP-712, state machine) | ~3.0M |
| Setup transactions (roles, tiers, catalogue, signer, ~30 txs) | ~2.0M |
| **Total** | **~15M gas** (use ~20M with a 30% buffer) |

#### Predicted mainnet deployment cost (L2 execution part)

| Gas price scenario | 15M gas | 20M gas (buffered) |
|---|---:|---:|
| Floor — 0.02 gwei | 0.0003 ETH ≈ **$0.82** | 0.0004 ETH ≈ $1.09 |
| Moderate — 0.12 gwei | 0.0018 ETH ≈ **$4.91** | 0.0024 ETH ≈ $6.54 |
| Busy — 0.5 gwei | 0.0075 ETH ≈ **$20.44** | 0.0100 ETH ≈ $27.25 |
| Stress — 2.0 gwei | 0.0300 ETH ≈ **$81.75** | 0.0400 ETH ≈ $109.00 |

**L1 data fee:** add roughly **$1–25** for ~80–100 KB of total bytecode, depending on Ethereum congestion.

**Prediction:** a full mainnet deployment most likely costs **$1–30**. **Budget 0.05 ETH (~$150)** to cover deployment, setup, a redeploy, and verification retries during a fee spike. Testnet deployment uses free faucet ETH. Deploy when gas is near the floor; check the price with `cast gas-price` first.

If the contracts use upgradeable proxies, add ~0.5–1M gas per proxy (small at these prices).

#### Ongoing per-match gas (operating cost, paid by the settlement relayer)

| Transaction | Paid by | Est. gas |
|---|---|---:|
| Create room + deposit (with permit) | Host | ~150k |
| Join room + deposit | Guest | ~120k |
| Settle result | Relayer (platform) | ~150k |
| Cancel / refund | Host or anyone after expiry | ~60k |

Settlement cost per match and per 10,000 matches:

| Gas price | Per settlement | Per 10,000 matches |
|---|---:|---:|
| 0.02 gwei | ≈ $0.008 | ≈ $82 |
| 0.12 gwei | ≈ $0.05 | ≈ $491 |
| 0.5 gwei | ≈ $0.20 | ≈ $2,044 |
| 2.0 gwei | ≈ $0.82 | ≈ $8,175 |

Settlement gas is cheap at normal prices but can become a real cost during fee spikes. Monitor the relayer balance, alert below a threshold, and decide who funds gas long term (§19 item 13). A fee spike must never block refunds; players can always submit refunds themselves.

---

## 10. Data Model

Suggested PostgreSQL schema; adapt to the final contract design.

Conventions:

- Store token amounts (uint256) as `NUMERIC(78,0)` in the token's smallest unit (wei-style), never as floats.
- Store addresses lowercased (`TEXT` with a check constraint `~ '^0x[0-9a-f]{40}$'`) and render checksummed in the UI.
- Every chain-derived row carries `chain_id` so testnet and mainnet data can never mix.

### `users`

- `id UUID PRIMARY KEY`
- `wallet_address TEXT UNIQUE NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

### `pets`

- `token_id TEXT PRIMARY KEY`
- `owner_address TEXT NOT NULL`
- `species TEXT NOT NULL`
- `level INTEGER NOT NULL`
- `health INTEGER NOT NULL`
- `power INTEGER NOT NULL`
- `intelligence INTEGER NOT NULL`
- `xp BIGINT NOT NULL`
- `metadata_version INTEGER NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

This is a read model; on-chain ownership remains authoritative.

### `battle_rooms`

- `id UUID PRIMARY KEY`
- `chain_id INTEGER NOT NULL`
- `chain_room_id TEXT NOT NULL` — `UNIQUE (chain_id, chain_room_id)`
- `host_address TEXT NOT NULL`
- `guest_address TEXT`
- `host_pet_id TEXT NOT NULL`
- `guest_pet_id TEXT`
- `stake_tier INTEGER NOT NULL` — one of 10, 20, 50, 100, 1000
- `stake_amount NUMERIC(78,0) NOT NULL`
- `fee_bps INTEGER NOT NULL DEFAULT 0` — snapshot at creation
- `status TEXT NOT NULL` — one of the §6.3 states (enforce with a CHECK or enum)
- `visibility TEXT NOT NULL`
- `rules_version INTEGER NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `expires_at TIMESTAMPTZ NOT NULL`
- `host_deposit_tx TEXT`
- `guest_deposit_tx TEXT`
- `settlement_tx TEXT`

### `matches`

- `id UUID PRIMARY KEY`
- `room_id UUID NOT NULL`
- `player1_address TEXT NOT NULL`
- `player2_address TEXT NOT NULL`
- `player1_pet_id TEXT NOT NULL`
- `player2_pet_id TEXT NOT NULL`
- `winner_address TEXT`
- `player1_rounds_won SMALLINT NOT NULL DEFAULT 0`
- `player2_rounds_won SMALLINT NOT NULL DEFAULT 0`
- `status TEXT NOT NULL`
- `rules_version INTEGER NOT NULL`
- `server_seed_commit TEXT NOT NULL` — published before round 1
- `server_seed TEXT` — revealed after the match
- `transcript_hash TEXT`
- `result_hash TEXT`
- `settlement_tx TEXT`
- `created_at TIMESTAMPTZ NOT NULL`
- `finished_at TIMESTAMPTZ`

### `battle_events`

- `id BIGSERIAL PRIMARY KEY`
- `match_id UUID NOT NULL`
- `round_number INTEGER NOT NULL`
- `turn_number INTEGER NOT NULL`
- `player_address TEXT`
- `action_type TEXT NOT NULL`
- `action_data JSONB NOT NULL`
- `rng_proof JSONB`
- `created_at TIMESTAMPTZ NOT NULL`

Make this append-only for gameplay and disputes (revoke UPDATE/DELETE for the application role). Add `UNIQUE (match_id, round_number, turn_number, player_address)` to reject duplicate actions. Protect sensitive operational data separately.

### `coin_transactions`

- `id UUID PRIMARY KEY`
- `wallet_address TEXT NOT NULL`
- `transaction_type TEXT NOT NULL`
- `amount NUMERIC(78,0) NOT NULL`
- `status TEXT NOT NULL`
- `chain_tx_hash TEXT`
- `room_id UUID`
- `created_at TIMESTAMPTZ NOT NULL`

### Additional tables

- `equipment_catalog`
- `pet_progression_events`
- `redemption_requests`
- `staking_positions`
- `match_rewards`
- `chain_events`
- `admin_audit_log`

Use idempotent chain-event processing. Store block number, transaction hash, log index, and event identity (`UNIQUE (chain_id, tx_hash, log_index)`). Handle chain reorganizations where applicable.

Suggested indexes: `battle_rooms (status, stake_tier, visibility)` for the lobby, `battle_events (match_id, id)` for replays, `coin_transactions (wallet_address, created_at DESC)` for history, `pets (owner_address)`.

---

## 11. API Design

All endpoints that mutate user or match state must authenticate the user and validate authorization. On-chain writes are submitted by the user wallet or a clearly disclosed relayer flow.

### Authentication

- `POST /auth/nonce`
- `POST /auth/verify`

Use a unique, expiring nonce and verify the wallet signature. Do not authenticate solely from a supplied address.

### Pets

- `GET /pets`
- `GET /pets/:tokenId`
- `GET /pets/catalog`
- `POST /pets/purchase/quote`
- `POST /pets/progression/quote`

### Rooms

- `GET /rooms?tier=20&visibility=public`
- `POST /rooms/quote`
- `POST /rooms`
- `POST /rooms/:roomId/join/quote`
- `POST /rooms/:roomId/ready`
- `POST /rooms/:roomId/cancel`
- `GET /rooms/:roomId`
- `GET /rooms/:roomId/status`

Room creation and joining responses should include the contract address, chain ID, exact token amount, room ID, transaction instructions, expiry, and user-readable terms. Do not treat the API response as proof of payment.

### Matches

- `GET /matches/:matchId`
- `GET /matches/:matchId/replay`
- `GET /matches/:matchId/seed` (seed commitment; revealed seed after the match)
- `POST /matches/:matchId/forfeit` (subject to defined rules)

Battle actions are sent over the authenticated WebSocket (`battle:action`), not REST, to keep turn latency low. Each action carries a client-generated `actionId` so retries are idempotent.

### Account

- `GET /me/balances` — returns `available`, `lockedInRooms`, and `pendingSettlement` separately, each with the block number it was read at.

### Economy

- `GET /economy/quote`
- `GET /economy/reserves`
- `GET /economy/transactions`
- `POST /economy/redemption/quote`

### WebSocket events

- `room:created`
- `room:updated`
- `room:joined`
- `battle:started`
- `battle:turn`
- `battle:action`
- `battle:state`
- `battle:result`
- `match:settlement_pending`
- `match:settled`

WebSocket messages are requests or display updates, not proof of on-chain settlement.

---

## 12. Frontend Pages

1. **Landing page:** game concept, supported network, clear status (testnet/mainnet), legal links.
2. **Wallet connection:** network check, signature login, error states.
3. **Pet collection:** owned pets, species, stats, level, equipment.
4. **Pet detail:** progression, history, equipment, metadata version.
5. **Marketplace/catalogue:** approved pets, equipment, transparent prices.
6. **Room lobby:** fixed stake tiers, public rooms, room status, total pot, entry cost, fee, payout.
7. **Create room:** selected tier, exact amount, deposit confirmation, cancellation deadline.
8. **Room waiting screen:** host/opponent status, escrow status, invite link, cancel eligibility.
9. **Battle screen:** health, energy, wind, projectile trajectory, turn timer, connection status.
10. **Result screen:** winner, rounds, replay, gross payout, fee, net result, settlement transaction.
11. **Wallet/economy page:** available vs locked coins, transactions, redemption status, reserve disclosures.
12. **Staking page:** separate staking token, amount, lock period, benefits, risks.
13. **Admin operations:** limited roles, monitoring, incidents, room/match inspection, audit logs.

Never show a locked room deposit as part of the user’s available balance.

---

## 13. Security, Anti-Cheat, and Reliability

### 13.1 Gameplay security

- Server-authoritative simulation.
- Strict action validation.
- Rate limiting and anti-spam.
- Per-turn deadlines.
- Deterministic replay records.
- Server-side pet/equipment stat resolution.
- Detect duplicate actions and out-of-order messages.
- Reconnect safely without resetting timers unfairly.
- Do not reveal private room secrets in public APIs.
- Keep service secrets out of frontend bundles and source control.

### 13.2 Smart contract security

- Replay protection and idempotent settlement.
- No arbitrary prize withdrawal.
- No admin ability to modify a funded room’s stake or winner.
- Safe refund/expiry paths.
- Reentrancy protection and safe token transfer handling.
- Explicit roles and multisig administration.
- Events for all meaningful state changes.
- Unit, fuzz, invariant, and integration tests.
- Independent audit before mainnet real-value activity.

### 13.3 Operational security

- Separate dev/testnet/mainnet keys and configurations.
- Keep signer keys in a secure signing service/HSM or equivalent secret-management system, not source code.
- Rotate credentials and restrict permissions.
- Monitor signer usage, settlement failures, reserve coverage, contract pauses, and unusual match patterns.
- Prepare incident-response procedures and a public status channel.
- Back up databases and test restoration.
- Reconcile indexed events against canonical chain state.

### 13.4 Mainnet release blockers

Do not launch real-value PvP until all are true:

- Legal review completed for target jurisdictions.
- Economy and reserve invariants reviewed.
- Contract audit completed and critical findings fixed.
- Match result signing and dispute/failure paths tested.
- Duplicate settlement and replay tests pass.
- Refund and expiry scenarios pass.
- Load tests and incident drills pass.
- User-facing fees, risks, and payout terms are accurate.
- Monitoring and emergency response are operational.

---

## 14. Testing Plan

### Unit tests

- Same power and angle: a head hit always deals more damage than a body hit, and body more than splash.
- Head/body contact in the same step resolves to the earlier contact; an exact tie resolves to body.
- No single hit exceeds the one-shot cap (40% of max health), including power shot + head + max equipment.
- Helmet/zone-defense equipment reduces head damage only up to its cap.
- Hit-zone results are identical when the same transcript is replayed.
- Room creation at every allowed tier.
- Reject unsupported tiers.
- Exact host deposit required.
- Exact opponent deposit required.
- Reject self-join if disabled.
- Reject third participant.
- Reject deposits after expiry.
- Reject start before both deposits confirm.
- Settle 40-coin pool correctly for a 20-coin room.
- Winner must be a participant.
- Reject duplicate result submission.
- Refund host if opponent never joins and room expires.
- Refund both sides for eligible aborted matches.
- Ensure fee calculations are exact and disclosed.
- Ensure locked balances cannot be spent twice.
- Ensure redemption cannot violate reserve rules.
- Ensure staking balance does not count as redemption reserve.

### Fuzz and invariant tests

- Contract token balance must cover all escrow liabilities.
- A room cannot be settled more than once.
- A funded room’s stake amount cannot change.
- Total paid-out value cannot exceed the escrowed pot, except through explicitly funded rewards.
- User funds cannot be withdrawn by an unauthorized account.
- All valid expired/cancelled rooms have a valid refund path.
- Reserve accounting stays consistent across mint, burn, purchase, and redemption.

### Integration tests

- Wallet signs in.
- User funds a room on testnet.
- Indexer confirms deposits.
- Backend starts match only after both deposits.
- Battle replay reconstructs the same result.
- Authorized signer submits result.
- Contract settles correctly.
- Frontend displays correct available and locked balances.
- Duplicate/reordered chain events do not duplicate balances or rewards.

### Adversarial tests

- Backend crashes after both deposits.
- Player disconnects near turn deadline.
- Result signer key is rotated or revoked.
- Wrong chain ID.
- Failed or delayed RPC.
- Duplicate settlement transaction.
- Malformed transcript.
- Player attempts to alter pet stats client-side.
- Player sends an action for another player’s turn.
- Contract pause during an active room.
- Chain event reorg / delayed indexer.
- Redemption request when reserve is insufficient.

---

## 15. Development Roadmap

### Phase 0 — Product and legal boundaries

- Confirm game rules and species identity.
- Decide whether the initial product is testnet-only and non-redeemable.
- Document room cancellation, timeout, refund, and dispute policies.
- Define the economic model and whether fees exist.
- Obtain legal review before real-value wagering.

**Deliverable:** approved product requirements and threat model.

### Phase 1 — Offline combat prototype

- Build dog-vs-cat prototype.
- Implement turn-based throws, wind, trajectories, energy, health, and best-of-three.
- Create deterministic simulation tests and replay viewer.
- Tune combat without blockchain.

**Deliverable:** playable single-device or local multiplayer prototype.

### Phase 2 — Multiplayer backend

- Wallet nonce authentication.
- Public/private room service.
- WebSocket state synchronization.
- Server-authoritative simulation.
- Reconnect, timeout, replay, and basic anti-cheat.
- No real-value stakes.

**Deliverable:** stable multiplayer test environment.

### Phase 3 — Testnet NFT and progression

- PetNFT starter dog.
- Species catalogue.
- Same-NFT progression.
- Equipment catalogue.
- Metadata update workflow.
- Testnet UI for collection and pet details.

**Deliverable:** users can own and evolve pets on testnet.

### Phase 4 — Testnet fixed-tier room escrow

- Implement 10/20/50/100/1000 tiers.
- Create/join and lock deposits.
- Add state machine and safe cancellation/refund paths.
- Sign and settle match results.
- Add events and indexer reconciliation.
- Run all adversarial and invariant tests.

**Deliverable:** full testnet loop from room creation through prize settlement.

### Phase 5 — Economy and staking testnet

- PETC purchase flow.
- Redemption model and reserve accounting.
- Separate staking token and vault.
- Fee/benefit rules, if needed.
- Reserve monitoring and underfunding simulations.

**Deliverable:** tested economy without mainnet promises.

### Phase 6 — Audit and controlled beta

- Independent contract audit.
- Security review of signer and backend.
- Load testing.
- Legal/compliance sign-off.
- User terms, privacy, and support procedures.
- Limited beta with monitoring and documented caps.

**Deliverable:** release candidate approved for a controlled rollout.

### Phase 7 — Mainnet launch

Only after all release blockers pass:

- Deploy with verified source and recorded addresses.
- Use multisig administration.
- Publish contract addresses and rules versions.
- Monitor reserve coverage, room liabilities, and settlements.
- Roll out gradually with limits and an incident response plan.

---

## 16. Repository Structure

Suggested monorepo:

```text
pet-fight/
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── api/                    # HTTP API and auth
│   ├── game-server/            # Authoritative match simulation
│   └── indexer/                # Chain event indexing/reconciliation
├── packages/
│   ├── game-engine/            # Shared deterministic game rules
│   ├── shared-types/           # DTOs, enums, schemas
│   ├── contract-clients/       # Typed contract ABIs/clients
│   └── config/                 # Rules and environment schemas
├── contracts/
│   ├── src/
│   │   ├── PetCoin.sol
│   │   ├── PetNFT.sol
│   │   ├── PetEquipment.sol
│   │   ├── GameTreasury.sol
│   │   ├── StakingVault.sol
│   │   └── BattleEscrow.sol
│   ├── test/
│   ├── script/
│   └── foundry.toml
├── infra/
│   ├── docker/
│   ├── monitoring/
│   └── deployment/
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── ECONOMY_AND_ESCROW.md
│   ├── SECURITY.md
│   ├── API.md
│   └── TEST_PLAN.md
├── .env.example
├── docker-compose.yml
└── README.md
```

Do not commit `.env`, private keys, seed phrases, signer secrets, production RPC credentials, or user data.

---

## 17. Cursor + Claude Implementation Instructions

Use Claude as a coding assistant, but implement in small, reviewable tasks. Do not ask it to generate the entire production system in one prompt.

### Recommended `CLAUDE.md` / project rules

Paste or adapt the following into the repository’s `CLAUDE.md`:

```markdown
# Pet Fight Engineering Rules

## Before coding
- Read the relevant docs under /docs.
- State assumptions and identify missing requirements.
- Propose a small implementation plan before editing multiple modules.
- Do not silently change economic, battle, or contract rules.

## Architecture
- Use TypeScript for frontend and backend.
- Use Solidity + Foundry + OpenZeppelin for contracts.
- Keep game rules versioned and deterministic.
- The server is authoritative for gameplay; clients are not authoritative.
- Chain state is authoritative for ownership, deposits, and settlement.
- The database is a read model and must be reconciled against chain events.

## Room escrow invariants
- Only fixed tiers 10, 20, 50, 100, and 1000 PETC are accepted.
- Host and opponent must each deposit exactly the selected tier.
- No match starts until both deposits are confirmed.
- The winner receives the pot minus only a disclosed, preconfigured fee.
- A room cannot be settled twice.
- The backend cannot withdraw escrow funds.
- A funded room's tier and payout terms cannot be changed.
- Every cancellable/expired state must have a documented refund path.
- Never count locked funds as available user balance.

## Security
- Never request or store user private keys.
- Never trust client-submitted winner, damage, RNG, or pet stats.
- Validate all inputs at API, game engine, and contract boundaries.
- Use nonce-based wallet authentication.
- Use access control, reentrancy protection, replay protection, and checks-effects-interactions where applicable.
- Do not add unrestricted minting or treasury withdrawal functions.
- Add tests for every bug fix and state transition.
- Do not claim a feature is secure without tests and review.

## Code quality
- Prefer small modules and explicit types.
- Validate API payloads with schemas.
- Use database transactions and idempotent event processing.
- Add structured logs without exposing secrets.
- Keep secrets in environment/secret management, never in code.
- Update docs and tests whenever behavior changes.
- Do not deploy to mainnet unless explicitly instructed and all release gates are satisfied.

## Working method
- Implement one phase at a time.
- After each task, report files changed, tests run, test results, known gaps, and next step.
- Do not fabricate test results or claim a command ran if it did not.
```

### Suggested first Claude prompt

```text
Read CLAUDE.md and docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md, and docs/ECONOMY_AND_ESCROW.md.

Do not implement the whole game yet. First:
1. Summarize the architecture and the critical room-escrow invariants.
2. Identify contradictions, missing decisions, and security risks.
3. Propose a Phase 1 implementation plan for a deterministic, offline TypeScript game engine with dog-vs-cat, wind, projectile power/angle, Intel Energy, health, and best-of-three rounds.
4. Define typed interfaces and a test plan.
5. Wait for approval before making code changes.
```

### Follow-up implementation prompts

**Task A — Game engine**

```text
Implement only the deterministic offline game engine approved in the plan. Add unit tests for valid actions, turn order, energy, health, round wins, best-of-three completion, and replay determinism. Do not implement blockchain or paid rooms in this task.
```

**Task B — Room state machine**

```text
Implement the backend room state machine and database model using test-only, non-redeemable credits. Enforce the states and transitions documented in ECONOMY_AND_ESCROW.md. Add tests for cancellation, expiry, duplicate joins, self-join, and reconnect behavior. Do not deploy contracts.
```

**Task C — Contract design review**

```text
Before writing Solidity, produce a threat model and a state-transition table for BattleEscrow. Specify how deposits, expiry, refunds, result signer rotation, result submission, one-time settlement, and pause behavior work. List the invariants and tests. Do not implement until the design is approved.
```

**Task D — Solidity implementation**

```text
Implement the approved BattleEscrow design in Solidity using Foundry and suitable OpenZeppelin components. Add unit, fuzz, and invariant tests. Use mock PETC and a mock authorized result signer. Do not deploy to mainnet. Do not add unrestricted admin withdrawals or arbitrary winner selection.
```

**Task E — Chain integration**

```text
Integrate the frontend and backend with the testnet contracts. Confirm deposits from canonical chain events, not from client claims. Keep available and locked balances separate. Add tests for delayed/duplicate events, failed RPC, wrong network, and duplicate settlement.
```

---

## 18. Definition of Done for the First Complete Testnet MVP

The first complete testnet MVP is done only when:

- A user can connect a wallet and authenticate by signature.
- A user can claim a starter dog on testnet.
- A user can create a room at exactly one of the five allowed stake tiers.
- The host’s entry amount is locked and shown as unavailable.
- A second player can join and lock the exact same amount.
- The match cannot start before both deposits are confirmed.
- The players can complete a best-of-three battle.
- The server generates a replayable result transcript.
- The settlement contract accepts one authorized result and pays the winner exactly once.
- For a 20 + 20 coin room with no fee, the winner receives 40 coins and the loser receives 0 from the pot.
- A host can safely recover their deposit if no opponent joins and the room expires.
- Eligible aborted matches have a documented, tested refund path.
- Frontend balances correctly distinguish available, locked, and paid-out coins.
- All critical unit, integration, fuzz, and invariant tests pass.
- No mainnet deployment or real-value wagering is enabled by default.

---

## 19. Open Decisions Before Production

The following must be finalized, not left to coding-agent assumptions. Resolution status for the current roadmap is tracked in [OPEN_DECISIONS.md](OPEN_DECISIONS.md).

1. Is PETC redeemable for ETH at a fixed rate, via a market, or through another model?
2. Is there a platform fee on the winner’s pot? If yes, what exact fee and how is it disclosed?
3. What happens if a match is interrupted after both players deposit?
4. What reconnect grace period and forfeit rule apply?
5. Who controls the result signer, how is it rotated, and how are disputes handled?
6. Are pet stats normalized in ranked matches?
7. Can pets or equipment be traded while a room is funded? Recommended: lock the selected pet/equipment state for the duration of a match.
8. Which jurisdictions and age groups can use the product?
9. What are the redemption reserve policy and emergency procedure?
10. What exact staking benefits are offered, and are any benefits yield-bearing?
11. What are the final game rules, damage values, and energy costs?
12. What chain/network and RPC provider will be used for each environment?
13. Who funds settlement gas long-term — the platform, a fee, or the winner?
14. What collusion/chip-dumping limits apply (e.g., max matches per wallet pair per day)?
15. Which hosting region(s) match the target player base, and which hosting provider?
16. How is XP earned and capped, and how often are progression updates written on-chain?
17. Are the round turn-limit and draw rules in §5.1 accepted, or replaced?
18. Final hit-zone multipliers (head 1.5× / body 1.0× / splash 0.5×), per-action overrides, and hitbox sizes per species (§5.5)?
19. Should hit zones be active in normalized/ranked mode, or only in casual mode?
20. Is the 0.05 ETH deployment budget and the relayer gas float approved (§9.6)?

---

## 20. Final Engineering Recommendation

Build in this order:

1. **Fun, deterministic combat prototype**
2. **Server-authoritative multiplayer**
3. **Testnet pet NFTs and progression**
4. **Testnet fixed-tier escrow rooms**
5. **Auditable settlement and recovery paths**
6. **Economy and staking**
7. **Independent security and legal review**
8. **Controlled mainnet rollout only after approval**

The most important money-flow invariant is simple: **the room contract holds both entry amounts until a valid result or a valid refund condition occurs.** The backend coordinates the game, but it must never have arbitrary control over player deposits or the prize pool.

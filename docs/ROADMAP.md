# Pet Fight roadmap

**Status:** Active build order  
**Date:** 2026-10-27  
**Spec:** [PRODUCT_SPEC.md](PRODUCT_SPEC.md)  
**Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)  
**Decisions:** [OPEN_DECISIONS.md](OPEN_DECISIONS.md)

Each phase is a separate implementation plan. A phase does not start the next phase inside the same change set. Mainnet deployment and real-value wagering stay off by default.

Phases 0 through 5 are implemented locally. Phase 6 has local beta controls in `docs/BETA.md`. A local web client is in `apps/web`. Spec §13.4 is not satisfied. Phase 7 has not started. Nothing here is a mainnet deploy.

## Phase 0 — Docs and threat model

**This phase.** Written output only. No apps, contracts, or package scaffolding.

Included:

- Product spec v1.2
- Architecture, including on-chain versus off-chain states, three deadlines, the EIP-712 `MatchResult` struct, 18-decimal amounts, and `rulesVersion` / `rulesHash`
- Decision log
- This roadmap
- `CLAUDE.md`

**Exit.** The open list in [OPEN_DECISIONS.md](OPEN_DECISIONS.md) is explicit. Combat numbers still missing are listed there as Phase 1 inputs. The threat model in [ARCHITECTURE.md](ARCHITECTURE.md) names signer compromise, stuck funds, relayer gas, chip-dumping, client tampering, replay, reorgs, and admin limits.

## Phase 1 — Headless engine

Implemented in `packages/game-engine`. Dog and cat only. Run `npm test` in that package.

In scope:

- Version 1 rules file, with the Phase 1 inputs filled and then frozen
- Turns, energy, wind, fixed-point trajectories, hit zones, one-shot cap
- Best of three, including draw, replay-once, and void-round rules
- Replay: the same transcript produces the same result

Out of scope: wallets, servers, contracts, paid rooms, bird, pig, equipment bonuses, XP, and a battle renderer. A JSON replay is enough. Phaser 3 versus PixiJS is chosen later, when a battle view is built.

**Exit.** Unit tests cover valid actions, turn order, energy, health, head versus body versus splash, the same-step tie, the 40% cap, round wins, best-of-three completion, match-level draw, and replay equality.

## Phase 2 — Local multiplayer

Implemented in `apps/game-server`. Test credits live in memory. No contracts and no database. Run `npm test` in that package.

In scope:

- Wallet nonce authentication
- Public and private rooms and the room state machine
- WebSocket `battle:action` with an idempotent client `actionId`
- Server-authoritative simulation using the Phase 1 engine
- Reconnect, timeout, and forfeit, using the rule locked in [OPEN_DECISIONS.md](OPEN_DECISIONS.md)

Local credits settle as soon as the match ends, so rooms go from `IN_PROGRESS` to `SETTLED` without a `RESULT_PENDING` wait. Chain settlement still uses that state in Phase 4. A restart clears rooms and balances.

Out of scope: chain deposits, settlement, redemption, and persistent storage.

**Exit.** Met. Two signed-in clients finish a best-of-three match over WebSocket. The transcript replays to the same winner. Cancellation, join-deadline expiry, start-deadline expiry, duplicate joins, and same-address self-join are tested. Reconnect grace and the three-timeout forfeit match the locked rule.

## Phase 3 — Testnet pets

Implemented in `contracts/src/PetNFT.sol` and `contracts/src/PetCoin.sol`. Not deployed to a public network. Official chain id and RPC are still open, so the only deploy script is local Anvil.

In scope:

- One starter dog per eligible wallet, auditable allow-list
- Species catalogue for dog and cat. Only the dog is mintable.
- Compact on-chain progression: species, level, XP checkpoint, metadata version. The token id does not change.
- Equipment catalogue whose entries have zero stat bonuses
- Collection page in `apps/indexer` that shows species, level, and metadata version

Out of scope: escrow UI is Phase 4, redemption, staking yield, and a public testnet deploy. Health, power, and intelligence on the page are derived from rules version 1.

**Exit.** Met locally. An allow-listed wallet claims one starter dog. A second claim reverts. Progression keeps the same token id. The collection page shows that pet. A public testnet claim waits on the chain-id check in [OPEN_DECISIONS.md](OPEN_DECISIONS.md).

## Phase 4 — Testnet escrow

Implemented in `contracts/src/BattleEscrow.sol` and `apps/indexer`. Run `forge test` in `contracts/` after `forge install`. Run `npm test` in `apps/indexer`.

In scope:

- Tiers 10, 20, 50, 100, and 1,000 with 18-decimal amounts
- Host and guest deposits, three deadlines, permissionless refunds
- EIP-712 settlement, one match per room, relayer submission, player submission
- Indexer reconciliation from chain events, including a removed log
- Foundry unit, fuzz, and invariant tests
- Frontend balances split into available, locked, and pending settlement

The local game server still plays credit rooms with test credits. It also reads the deployed testnet escrow. `assertDepositsConfirmed` blocks a chain session until both deposits are in a `READY` room. The server does not submit the on-chain payout and does not hold a signer key. There is no admin winner and no redemption.

Out of scope: mainnet, a non-zero default fee, redemption, staking, and a public deploy.

**Exit.** Met for the contract and the local read model. A 20 + 20 room with fee 0 pays the winner 40. Draws and all three deadlines refund. The same log does not pay twice, and a removed log reverses the read model. The public testnet loop is not live. Official docs publish chain ids 4663 and 46630, and no contracts have been deployed there.

## Phase 5 — Economy and staking

Implemented in `contracts/src/PetShop.sol` and `contracts/src/StakingVault.sol`. Not deployed. PETC stays non-redeemable.

A user can receive PETC in three ways: win a match, buy it with test ETH, or stake the existing `$PET` token and claim PETC from a funded reward pool. The pool cannot mint PETC. Staked `$PET` cannot be cashed out for ETH.

Placeholder economics, in [OPEN_DECISIONS.md](OPEN_DECISIONS.md): 10,000 PETC per 1 test ETH, 0.000001 PETC per 1 `$PET` per day, and a 7-day lock. Testnet `$PET` is `0x1E9d9FCe560d8A691d6Bce813460891215300b2b` on chain 46630. The testnet deploy script stakes that token. Nothing is deployed to mainnet.

**Exit.** Met for the contracts and tests. No redemption, no public deploy, and no mainnet promise.

## Phase 6 — Audit and controlled beta

Started locally. The server caps open rooms and sockets, pauses new rooms when `BETA_PAUSED=true`, and exposes `GET /ops/status`. The player notice, privacy note, support path, incident steps, and internal review are in [BETA.md](BETA.md).

Not done: an independent contract audit, legal review, a hosted multi-machine load test, KMS signer separation, and a public deployment. A local 1,000-player run, with no contracts, passed. Real-value play stays off.

**Exit.** Not met. Spec §13.4 is still the blocker for a controlled public rollout and for Phase 7.

## Phase 7 — Mainnet

Only after every Phase 6 blocker is true.

- Deploy with verified source and recorded addresses
- Multisig administration
- Published contract addresses and rules versions
- Monitoring for reserve coverage (if redemption exists), room liabilities, and settlements
- Gradual rollout and an incident response plan

**Exit.** Real-value play is enabled only where counsel and the audit say it is allowed. Default config still does not turn that on by itself.

## Testnet MVP definition of done

From spec §18. The first complete testnet MVP is done only when all of the following are true:

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

## Suggested task prompts

Use these after Phase 0, one at a time. Read `CLAUDE.md` and the docs for that phase first. Wait for approval before editing multiple modules.

**Phase 1.** Implement only the deterministic offline game engine. Add unit tests for valid actions, turn order, energy, health, hit zones, round wins, best-of-three completion, draws, and replay determinism. Do not implement blockchain or paid rooms.

**Phase 2.** Done. The local server is `apps/game-server`. Do not add contracts in a follow-up to this phase.

**Phase 4 design, before Solidity.** Produce a threat model and a state-transition table for `BattleEscrow`. Specify deposits, the three deadlines, refunds, signer rotation, result submission, one-time settlement, draw refunds, and pause. List the invariants and tests. Do not implement until the design is approved.

**Phase 4 implementation.** Implement the approved `BattleEscrow` design in Solidity with Foundry and OpenZeppelin. Add unit, fuzz, and invariant tests. Use mock PETC and a mock authorized result signer. Do not deploy to mainnet. Do not add unrestricted admin withdrawals or arbitrary winner selection.

**Chain integration.** Confirm deposits from canonical chain events, not from client claims. Keep available and locked balances separate. Add tests for delayed and duplicate events, failed RPC, the wrong network, and duplicate settlement.

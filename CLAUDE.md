# Pet Fight Engineering Rules

## Before coding

- Read the relevant docs under `docs/`.
- Required reading for every task: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md), and [docs/ROADMAP.md](docs/ROADMAP.md).
- Escrow rules live in `docs/ARCHITECTURE.md` until a later phase adds `docs/ECONOMY_AND_ESCROW.md`.
- State assumptions and identify missing requirements.
- Propose a small implementation plan before editing multiple modules.
- Do not silently change economic, battle, or contract rules.
- If a value is listed under "Open on purpose" in `docs/OPEN_DECISIONS.md`, stop and ask. Do not invent it.
- Implement one phase from `docs/ROADMAP.md` at a time. Do not start the next phase in the same change set.

## Architecture

- Use TypeScript for frontend and backend.
- Use Solidity + Foundry + OpenZeppelin for contracts.
- Keep game rules versioned and deterministic. A match commits to both `rulesVersion` and `rulesHash`.
- The server is authoritative for gameplay; clients are not authoritative.
- Chain state is authoritative for ownership, deposits, and settlement.
- The database is a read model and must be reconciled against chain events.
- `pets` health, power, and intelligence are a derived cache, not the on-chain stat record.
- On-chain progression stores species, level, XP checkpoint, and metadata version.
- Authoritative combat uses integer math scaled by 1,000 and the seeded PRNG in `packages/game-engine`. Do not use `Math.random()` or floating-point trigonometry there.
- `IN_PROGRESS` and `RESULT_PENDING` are off-chain. On-chain room states and the three deadlines are defined in `docs/ARCHITECTURE.md`.
- Chain id, RPC, and explorer come from environment config. Official Robinhood docs publish mainnet `4663` and testnet `46630`. Confirmation depth for "posted to Ethereum" is still unset. Do not deploy to mainnet from a feature task.

## Room escrow invariants

- Only fixed tiers 10, 20, 50, 100, and 1000 PETC are accepted. The field name is `stakeTier`, never `level`.
- PETC has 18 decimals. The on-chain amount is `stakeTier * 10^18`.
- Host and opponent must each deposit exactly the selected tier.
- Same-address self-join is rejected.
- No match starts until both deposits are confirmed.
- Working `feeBps` is 0. Snapshot `feeBps` into the room at creation. `MAX_FEE_BPS` is 500. Fee math rounds down. Refunds are fee-free.
- The winner receives the pot minus only a disclosed, preconfigured fee.
- A match-level draw refunds both deposits in full. In the EIP-712 struct, that is `winner == address(0)`.
- One match per room: `matchId = keccak256(abi.encode(roomId, uint256(1)))`.
- A room cannot be settled twice.
- The backend cannot withdraw escrow funds. A result signer cannot withdraw funds.
- A funded room's tier and payout terms cannot be changed.
- Every cancellable or expired state must have a documented refund path: `joinDeadline`, `startDeadline`, and `settleDeadline`.
- `markStarted` records time only. It does not move tokens.
- Never count locked funds as available user balance.
- Testnet PETC is non-redeemable. Do not add a redemption path. `PetShop` and `StakingVault` use the placeholder numbers in `docs/OPEN_DECISIONS.md`.
- Do not market a signed server result as trustless.

## Security

- Never request or store user private keys or seed phrases.
- Never trust client-submitted winner, damage, RNG, or pet stats.
- Validate all inputs at API, game engine, and contract boundaries.
- Use nonce-based wallet authentication.
- Use access control, reentrancy protection, replay protection, and checks-effects-interactions where applicable.
- Do not add unrestricted minting or treasury withdrawal functions.
- Do not add an admin function that selects a winner or edits a funded room.
- Result signatures are EIP-712 typed data bound to the contract name, version, `chainId`, and `verifyingContract`.
- Add tests for every bug fix and state transition.
- Do not claim a feature is secure without tests and review.
- Do not commit `.env`, private keys, signer secrets, or production RPC credentials.

## Code quality

- Prefer small modules and explicit types.
- Validate API payloads with schemas.
- Use database transactions and idempotent event processing.
- `battle_events` stays append-only for the application role.
- Add structured logs without exposing secrets.
- Keep secrets in environment or secret management, never in code.
- Update docs and tests whenever behavior changes.
- Do not deploy to mainnet unless explicitly instructed and all release gates in spec §13.4 are satisfied.
- The 0.05 ETH figure in spec §9.6 is a planning ceiling, not permission to deploy or buy ETH.

## Working method

- Implement one phase at a time.
- After each task, report files changed, tests run, test results, known gaps, and the next step.
- Do not fabricate test results or claim a command ran if it did not.
- Rules version 1 lives in `packages/game-engine/src/rules/v1.ts` and is listed in `docs/OPEN_DECISIONS.md`. Do not change those numbers inside a match; add a new rules version.
- Phase 1 is the headless engine only. Do not implement blockchain or paid rooms in that phase.
- Phase 2 is the local server in `apps/game-server`: in-memory test credits, wallet nonce sessions, and WebSocket battles on the Phase 1 engine. Reconnect grace is 30 seconds, once per turn, and three consecutive timeout passes forfeit the pot to the opponent. Those numbers are locked in `docs/OPEN_DECISIONS.md`.
- Phase 3 and Phase 4 contracts live in `contracts/`. PetCoin is non-redeemable and capped. PetNFT mints one starter dog per allow-listed wallet. BattleEscrow is the settlement contract. `contracts/script/DeployLocal.s.sol` reverts unless the chain id is 31337. Do not deploy to mainnet or to an unverified public RPC.
- The engine sha256 `RULES_HASH_V1` and the escrow's bytes32 `rulesHash` are different identifiers. Sign the hash stored on the room.
- PETC is not redeemable. The three ways to receive it are a match win, a test-ETH purchase through `PetShop`, and a claim from `StakingVault`. Do not mint PETC from the shop or the vault. Placeholder economics are 10,000 PETC per 1 test ETH, 0.000001 PETC per 1 `$PET` per day, and a 7-day lock. Testnet `$PET` is `0x1E9d9FCe560d8A691d6Bce813460891215300b2b` on Robinhood chain 46630. `DeployRobinhoodTestnet.s.sol` stakes that token. Do not deploy the vault to mainnet, and do not point it at a different PET token.
- Phase 6 local beta controls live in `apps/game-server` and `docs/BETA.md`. Caps are 1,000 sockets and 500 open rooms. Do not add a switch that enables real-value or mainnet play. An independent audit and legal review are still required before spec §13.4 is treated as done.

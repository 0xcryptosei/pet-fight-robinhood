# Pet Fight decision log

**Status:** Locked for the roadmap on 2026-10-27  
**Spec questions:** [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §19  
**Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)

Two lists follow. The first is working rules for later phases. The second is unresolved. Coding must not invent values for the second list, and must not change the first list inside a feature branch. A change to a locked rule is a docs change in this file before the code change.

"Locked" here means the roadmap's working rule. Combat numbers are rules-version 1 placeholders for tuning. They are not a claim that the game is balanced.

## Locked working rules

### Economy and custody

| # | Spec question | Working rule |
|---|---|---|
| 1 | Is PETC redeemable? | No, in every environment, until a later written decision. Testnet PETC is a non-redeemable test token. `GameTreasury` redemption is out of scope. |
| 2 | Platform fee? | `feeBps = 0` on new rooms. The contract still snapshots `feeBps` and enforces `MAX_FEE_BPS = 500`. UI shows a fee only when the snapshot is non-zero. |
| 3 | Both players deposited, match interrupted? | Three deadlines in [ARCHITECTURE.md](ARCHITECTURE.md): `joinDeadline`, `startDeadline`, `settleDeadline`. No valid result by `settleDeadline` means anyone can refund both deposits in full, with no fee. |
| 5 | Result signer, rotation, disputes? | One secp256k1 KMS key per environment. The private key stays in KMS. Rotation is a multisig and timelock role change. The contract accepts only the current signer, so unsubmitted results are signed again. `DISPUTED` is off-chain. There is no admin function that picks a winner. The on-chain fallback is the refund deadline. |
| 7 | Trade pets or equipment during a funded room? | No effect on the match. The pet token ids and the stat snapshot are fixed for the room. Transfers do not swap the combatant. |
| 17 | Accept §5.1 turn limit and draws? | Yes. |

### Local play

| # | Spec question | Working rule |
|---|---|---|
| 4 | Reconnect grace period and forfeit? | Locked for local play in `apps/game-server/src/config.ts` (`PHASE2`) and `live-match.ts`. The 15s turn timer runs only while the active player is connected. The first disconnect of a turn pauses it and grants 30s of grace, once per turn. A second disconnect in that turn does not pause again. Grace expiry or turn-timer expiry submits a server pass. Three consecutive timeout passes by one player forfeit the match to the opponent. An explicit action, including an explicit pass, clears that player's streak. A new turn for a player who is still disconnected starts a fresh grace immediately. Forfeit pays the full pot to the opponent at fee 0. A draw refunds both. No XP. |

### Combat, rules version 1

| # | Spec question | Working rule |
|---|---|---|
| 6 | Normalized ranked stats? | Ranked mode is out of the MVP. Matches use species, level, and equipment under the room's `rulesVersion`. |
| 11 | Rules, damage, energy? | Version 1 numbers are frozen in `packages/game-engine/src/rules/v1.ts`. The list is at the bottom of this file. |
| 18 | Hit-zone multipliers? | Head 1.5×, body 1.0×, splash 0.5×, miss 0. Sniping head 1.8×. Power-shot head 1.3×. Same-step exact tie is body. Integer floor. One-shot cap is 40% of defender max health. |
| 19 | Hit zones in ranked mode? | No ranked mode in the MVP. Hit zones are on in every mode that exists. A later ranked mode keeps hit zones on until a new decision says otherwise. |

Version 1 match shape:

- Best of three. First player to win two rounds wins the match.
- Each round resets each pet to its own max health and to 100 Intel Energy.
- Turn timer is 15 seconds. Turn limit is 20 turns per player.
- At the turn limit, the higher remaining health percentage wins the round.
- Same-step mutual knockout, or equal percentages, draws the round. That round is replayed once. A second draw voids the round.
- If five rounds produce no match winner, the match is a draw and both deposits are refunded.
- Actions: normal throw, power shot, sniping shot, double attack, heal, pass. Species abilities are rejected. Bird evasion is specified later, with bird, after the dog-vs-cat prototype.
- Energy costs: normal 0, double 25, sniping 30, power 35, heal 40.
- Full-power body baseline for a normal throw: 15. Heal restores 15 and cannot exceed max health.
- Fixed-point scale: 1,000.
- Seed commitment: publish `hash(serverSeed)` before round 1; reveal `serverSeed` after the match; mix in each player's client seed.
- Practice mode is off-chain, unstaked, and grants no XP.
- Zone defense is per zone and comes only from equipment. Version 1 has no equipment, so defense is 0.
- The transcript stores zone, contact point, multiplier, and damage for each shot.

### Identity, chain, and process

| Topic | Working rule |
|---|---|
| Decimals | 18. On-chain amount is `stakeTier * 10^18`. |
| Stake tiers | Only 10, 20, 50, 100, and 1,000. Field name is `stakeTier`. |
| Self-join | Rejected for the same address. |
| Match id | `keccak256(abi.encode(roomId, uint256(1)))`. One match per room. |
| XP | None until a later rules version. When it exists: a daily cap, reduced XP for repeat opponents, no XP on forfeit or practice, and batched on-chain claims. The numbers stay open. |
| Staking | Confirmed on 2026-10-27. `$PET` is the staking token and is not PETC. A user can receive PETC by winning a match, buying it with test ETH, or staking `$PET` and claiming PETC from a funded reward pool. The pool pays PETC that was already supplied. Staking does not mint PETC and does not cash PETC out for ETH. Staked `$PET` is not a redemption reserve. The vault must use the `$PET` contract on the same chain as the holders. Testnet `$PET` on Robinhood chain 46630 is `0x1E9d9FCe560d8A691d6Bce813460891215300b2b` (name Pet, symbol PET, 18 decimals). That address has no code on mainnet. Placeholder economics, chosen 2026-10-27 and meant to be replaced before a public sale: `PetShop` sells 10,000 PETC per 1 test ETH (1 PETC costs 0.0001 test ETH) from a pre-funded inventory. `StakingVault` pays 0.000001 PETC per 1 `$PET` per day from that pool. Staking locks the whole `$PET` position for 7 days from the latest stake. Rewards can be claimed during the lock. Unstake returns `$PET` only. |
| Collusion | Log repeated pairs, short matches, and idling. No confiscation and no silent pair ban. |
| Settlement gas on testnet | The relayer pays. Anyone may submit the signed result. Players can submit refunds themselves. |
| Hosting for phases 0–1 | Developer laptop and Docker. No cloud purchase in this roadmap. |
| Renderer | Headless engine and JSON replay first. Phaser 3 versus PixiJS is chosen when a battle view is built. |
| Starter dog | One per eligible wallet, auditable allow-list. Copy must not say one wallet equals one human. |
| Mainnet and real-value play | Off by default. Blocked on spec §13.4. `PHASE6.realValue` is fixed false. |
| Controlled beta caps | 1,000 connected sockets and 500 open rooms, from spec §9.5 tier C. A repeated pair is logged after two finished matches and is not blocked. `BETA_PAUSED=true` refuses new rooms. |
| Deployment gas figure | 0.05 ETH in spec §9.6 is a planning ceiling. It is not approval to buy ETH or deploy. |

## Open on purpose

Coding must not pick these.

| # | Question | Why it stays open | What to do instead |
|---|---|---|---|
| 1 | Mainnet redemption model and reserve policy | Legal and product decision. The working rule is non-redeemable only. | Do not add `GameTreasury` redemption. Spec §7.2 applies if a later decision turns redemption on. |
| 2 | A non-zero fee, and the disclosure copy | Working fee is 0. A real fee needs an explicit product decision under the 500 bps cap. | Do not turn on a fee inside a feature task. |
| 8 | Jurisdictions, age, geo gates | Counsel has not decided. | No geo gate in testnet code. |
| 9 | Reserve emergency procedure | Depends on redemption, which is off. | Do not add an admin drain. |
| 10 | Mainnet `$PET` address | The testnet token is locked in the staking row. A public PET/PET token at `0xA49e56cB03aa6690bB40B9aEEfb0ca22Ad8B1E18` on chain 4663 is a Doppler clone and is not the test token. | Do not point `StakingVault` at a guessed mainnet token. The testnet script uses only `0x1E9d9FCe560d8A691d6Bce813460891215300b2b` on chain 46630. |
| 12 | Confirmation depth for "posted to Ethereum" | Official Robinhood docs publish mainnet chain id 4663 (`https://rpc.mainnet.chain.robinhood.com`) and testnet chain id 46630 (`https://rpc.testnet.chain.robinhood.com`). | `contracts/script/DeployLocal.s.sol` still reverts unless the chain id is 31337. `DeployRobinhoodTestnet.s.sol` allows only 46630. How many confirmations count as posted stays unset. |
| 13 | Who funds settlement gas long term | Testnet uses the relayer. A fee or a winner-paid model is a product decision. | Do not skim gas from the pot. |
| 14 | Numeric collusion limits | Monitoring is the MVP. A max matches-per-pair number is not chosen. | Log and flag. Do not confiscate. |
| 15 | Hosting region and provider | Player geography is unknown. | Local Docker for phases 0–1. |
| 16 | Exact XP amounts and claim cadence | Principles are locked; numbers are not. | No XP in the engine until a rules version defines them. |
| 20 | Spending 0.05 ETH and funding a relayer float | Planning ceiling only. | No deploy and no ETH purchase from this roadmap. |

## Rules version 1 numbers

Frozen on 2026-10-27 in [packages/game-engine/src/rules/v1.ts](../packages/game-engine/src/rules/v1.ts). These are tuning placeholders. A change is a new rules version, not an edit to a match already started.

- Full-power body baselines: normal throw 15, sniping shot 20, power shot 28, each double-attack hit 9.
- Heal restores 15. At most 2 heals per round. Energy costs: normal 0, double 25, sniping 30, power 35, heal 40.
- `statFactor = 1000 + (power - 50) * 5`, with a floor of 100. Dog power 70 → 1100. Cat power 55 → 1025. Intelligence is stored and does not change damage. Level 1 uses the species base stats; this version has no level curve.
- Zone defense is per zone, in thousandths, clamped to 200. Version 1 pets have no equipment, so defense is 0. A head defense does not change body damage.
- Splash radius 500. Gravity 9800 milli-units per second squared. Timestep 50 ms, at most 400 steps. Full-power speed 7000. Wind is an integer from −2000 to 2000.
- Arena 0..12000 by 0..8000. Dog stands at x 2000 facing right. Cat stands at x 8000 facing left. The muzzle is 450 units in front of the pet at height 450.
- Hitboxes are axis-aligned and listed in the rules file. The head sits on top of the body, about 30% of the target area, and is narrower than the body. In still air, more full-power angles hit the body than the head.
- Shots are tested only against the defender. Integration is explicit Euler with truncating division. Sine and cosine come from the integer degree table. A direct hit wins over a ground crossing on an equal step parameter. An equal head/body contact is body.
- Odd round slots start with player 1. Even slots start with player 2.
- Round wind comes from mulberry32 seeded by the first 4 bytes of `sha256(serverSeed + newline + clientSeed1 + newline + clientSeed2 + newline + roundSlot + newline + attempt)`. A replayed draw uses attempt 2 and therefore a new wind.

The escrow stores the `rulesHash` supplied at room creation and checks the signed result against that snapshot. The architecture defines that value as `keccak256` of the canonical rules JSON. The engine's `RULES_HASH_V1` is a separate sha256 hex digest. A settlement signature has to use the bytes32 stored on the room.

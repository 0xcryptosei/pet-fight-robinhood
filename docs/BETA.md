# Phase 6 — Controlled beta

**Status:** Engineering controls are in the local server. Spec §13.4 is not satisfied. Real-value play stays off. This file is not an independent audit and not a legal sign-off.

## Release checklist

| Spec §13.4 blocker | Status |
|---|---|
| Legal review for target jurisdictions | Not done. Counsel has not reviewed this project. |
| Economy and reserve invariants reviewed | Internal tests cover escrow liabilities, purchase inventory, and the staking pool. No outside review. |
| Contract audit completed and critical findings fixed | Not done. No external auditor has been engaged. |
| Match result signing and dispute/failure paths tested | Local reconnect, forfeit, and escrow settle/refund tests exist. A production signer is not in KMS. |
| Duplicate settlement and replay tests pass | Covered by the escrow and engine tests already in the repo. |
| Refund and expiry scenarios pass | Covered for the three escrow deadlines and the local credit rooms. |
| Load tests and incident drills pass | Local 1,000-player run passed on 2026-10-27: 1,000 logins, 500 seated rooms, 1,000 websocket syncs, 0 failures, about 6.6 seconds, no contracts. The room cap, session cap, and pause switch are also tested. A hosted multi-machine run has not been done. |
| Fees, risks, and payout terms shown accurately | The player notice below matches the current rules. It is not a counsel-approved terms page. |
| Monitoring and emergency response operational | `GET /ops/status` is local. Stopping new rooms is `BETA_PAUSED=true` and a process restart. Chain pause is a contract admin action and is not wired to this server. |

## Caps

From spec §9.5 tier C, the local server allows at most **1,000** connected sockets and **500** open rooms. Settled, cancelled, and expired rooms do not count toward the room cap. A repeated pair is listed on the status page after two finished matches. The server records that pair and still lets them play. It does not confiscate credits.

`PHASE6.realValue` is fixed to `false`. There is no environment switch that turns mainnet or real-value play on.

Restart the local server with `BETA_PAUSED=true` to refuse new rooms. Existing rooms are left to their normal deadlines and refunds.

## Internal review

Reviewed with the code in this repo on 2026-10-27. This is the project's own review.

- `BattleEscrow` still has no admin winner, no escrow withdrawal, and fee 0 on new rooms. The testnet deploy script sets admin, result signer, and relayer to the same deployer. Those roles have to be split, and the signer has to live in a KMS, before any real-value launch.
- `PetShop` sells a pre-funded PETC inventory. It has no sell-back. The admin can withdraw sale ETH and unsold PETC. Buyers who already paid keep the PETC they received.
- `StakingVault` pays PETC only from a funded pool. It does not mint. Unstake returns `$PET` after the 7-day lock. A short pool reverts the claim and leaves the stake in place. Adding to a stake refreshes the lock on the whole position.
- Testnet `$PET` is `0x1E9d9FCe560d8A691d6Bce813460891215300b2b` on chain 46630. The game server reads `BattleEscrow` at `0xE40D2d80E11ef4dD2F9E6Cfa02700967b0972958`. A chain session starts only after both deposits are in a READY room. That session does not move test credits and does not submit the on-chain payout. Local credit rooms still exist.
- The local login checks a wallet signature. The server does not take a private key.

## Player notice

Pet Fight on this server is a **Robinhood testnet** beta.

- Stake tiers are 10, 20, 50, 100, and 1,000 PETC. The room fee is 0, so the winner of a match receives the full pot. A draw returns both deposits.
- PETC cannot be redeemed for ETH.
- The test purchase price is 10,000 PETC per 1 test ETH. Test ETH is not mainnet ETH.
- Staking test `$PET` pays 0.000001 PETC per 1 `$PET` per day from a pool the project funds. The `$PET` lock is 7 days. Staked `$PET` is returned as `$PET`. It is not a cash reserve for PETC.
- One starter dog is one allow-listed wallet. That is not a check that the wallet belongs to a distinct person.
- The local server balance is test credits. A chain deposit is real only after the contracts are deployed and the indexer shows the deposit.
- Nothing here is an offer of real-value wagering.

## Privacy

The server stores the wallet address, the login nonce, the session token, and the match transcript in memory. There is no account email and no identity check. Do not send a private key or a seed phrase to the server or to support. This note is not a counsel-written privacy policy.

## Support

A room with no opponent can be cancelled by the host, or it refunds when the join window ends. If both players deposited and the match does not finish, the start window or the settle window refunds both. Say which room id and wallet address you mean. Support cannot change a finished result and cannot redeem PETC.

## Incident

1. Set `BETA_PAUSED=true` and restart the local server so new rooms stop.
2. Leave refunds and settlement available. Do not add an admin winner.
3. Read `GET /ops/status` for open rooms, settled rooms, and repeated pairs.
4. If the chain deployment is live, the contract admin pause stops new rooms and new deposits. Refunds and an already signed result stay possible.
5. Mainnet is out of scope until every row in the checklist above is actually done.

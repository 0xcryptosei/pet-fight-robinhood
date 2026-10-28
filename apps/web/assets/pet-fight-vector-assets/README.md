# Pet Fight — Vector UI Asset Pack v1.0

90 production assets for the 12 MVP screens, drawn to match the UI design system in spec §12.1
(navy `#0A1230` background, primary blue `#2F6BFF`, coin gold `#FFC53D`, Inter / rounded game style).

- `svg/` — master files. Vector, so they scale to any size without blurring. All text is converted to outlines, so no fonts are needed.
- `png/` — ready-to-use exports with transparent backgrounds, named `<asset>-<width>.png` (several sizes per asset, up to 4K for backgrounds).
- `PREVIEW-by-page.png` — every asset grouped by screen.
- `PET_ART_PROMPTS.md` — image-generation prompts for the painted pets (avatars, cards, battle sprites, hero group).

## Style rules (keep new assets consistent)
- Sticker style: dark navy outline `#0B1433` (8 px at 256 px), top-left gloss highlight, darker underside "3D" offset.
- Backgrounds: soft flat painting, no outlines, atmospheric (paler and bluer) in the distance.
- Line icons: 24 px grid, 2 px stroke, round caps/joins, `currentColor` (default `#EAF0FF`). Set CSS `color` to recolor.

## Asset map by screen

| Screen | Folder | Assets | Where they go |
|---|---|---|---|
| All | `00-ui-icons/` | home, pets, battle, practice, marketplace, inventory, leaderboard, profile, wallet, settings, copy, close, plus, lock, clock, check, external-link, info, wind, refresh, chevron-right/down, logout, bell, shield-check, replay, gas, swap, invite, eye | Side/bottom navigation, buttons, status rows |
| 1 Landing | `01-landing/brand/` | logo-mark, logo-stacked, logo-horizontal, app-icon (48–1024), favicon (16–64), testnet-badge | Header logo, hero logo, PWA/store icon, browser tab |
| 1 Landing | `01-landing/backgrounds/` | landing-hero-bg (1920, 3840) | Hero card; pets stand on the right-hand cliff |
| 1 Landing | `01-landing/features/` | feature-own-pets, feature-grow, feature-skill, feature-escrow | The 4 feature cards |
| 2 Connect wallet | `02-connect-wallet/` | wallet-illustration | Dialog header art |
| 3 Sign-in | `03-sign-in/` | signature-illustration | Dialog header art |
| 4 Lobby | `04-lobby/backgrounds/` | lobby-banner-bg (1600, 3200) | "Ready for battle?" banner; text on the darker left, pets on the right hill |
| 4 Lobby / all | `04-lobby/currency/` | coin-petc | Every coin amount and balance |
| 5 Create room / 11 Room list | `05-create-room/tiers/` | tier-10, tier-20, tier-50, tier-100, tier-1k | Stake tier cards, room rows (bronze → silver → gold → emerald → royal) |
| 6 Waiting room | `06-waiting-room/` | vs-emblem, empty-slot | Between the two players; opponent placeholder |
| 7 Pets | `07-pets/stats/` | stat-hp, stat-pwr, stat-int, stat-energy | HP / PWR / INT labels on cards; Energy bar in battle |
| 7 Pets / 8 Upgrade | `07-pets/progression/` | level-badge (number overlaid in code), xp-star | Level chip, XP bar end, level-up toast |
| 8 Upgrade | `08-upgrade/items/` | pet-hat, pet-cloth, pet-shoes, pet-food, helmet | Required-item slots, equipment tab; helmet = head-defense item (§5.5) |
| 9 Battle | `09-battle/backgrounds/` | battle-arena-bg (1920, 3840) | Arena; flat spawn platforms at x≈380 and x≈1540, ground line y≈866 (at 1920 width) |
| 9 Battle | `09-battle/projectiles/` | bone, fish-bone, pumpkin, nut | Thrown objects (cosmetic per species: dog=bone, cat=fish bone, pig=pumpkin, bird=nut) |
| 9 Battle | `09-battle/actions/` | normal-throw, double-attack, sniping-shot, power-shot, heal | Action buttons |
| 9 Battle | `09-battle/hud/` | wind-left, wind-right, turn-timer, round-won/lost/current/pending, hit-burst, headshot-burst | HUD; hit-burst shows the damage number (added in code) |
| 9 Battle | `09-battle/hitbox-guides/` | hitbox-dog/cat/pig/bird | Practice-mode overlay and reference for battle sprite proportions (head 1.5×, body 1.0×) |
| 10 Result | `10-result/` | banner-victory, banner-defeat, banner-draw, trophy | Result title, win celebration |
| 12 Profile | uses `00-ui-icons`, `coin-petc`, `level-badge`, `stat-*` | — | — |

## Not included
- **Painted pets:** use `PET_ART_PROMPTS.md`, or the extracted originals from `pet-fight-assets.zip` for prototypes.
- **Wallet brand logos:** use each wallet's official brand kit or the icons that come with your wallet-connection library.

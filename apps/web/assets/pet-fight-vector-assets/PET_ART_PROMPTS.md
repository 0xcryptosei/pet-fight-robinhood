# Pet Fight — Pet Art Prompts

These prompts recreate the painted 3D-cartoon pets from the initial designs at production resolution.
They work with any modern image generator (Midjourney, DALL·E / GPT Image, Ideogram, Stable Diffusion / Flux).
Generate each at **2048 × 2048** or larger. Then remove the background if your tool can't output transparency.

## 1. Shared style block (paste at the start of every prompt)

> Stylized 3D cartoon game character, glossy soft-toy look, big expressive eyes with bright catchlights, rounded chunky proportions, clean silhouette, warm rim light from the upper left, soft ambient occlusion, vibrant saturated colors, mobile-game hero quality, consistent character design, high detail fur texture but smooth shapes, centered, full character visible, **transparent background** (or plain #00FF00 background for keying), no text, no logo, no watermark.

**Negative / avoid:** realistic photo, horror, scary teeth, weapons, gore, extra limbs, cropped ears or feet, busy background, text, frame, border.

**Consistency tips**
- Generate **one** character first, then reuse it as a reference image (image prompt / "character reference" / seed lock) for every other pose.
- Keep the same camera: eye-level, 3/4 view for portraits, pure side view for battle sprites.
- Battle sprites face **right**; mirror them in code for the opponent side.

## 2. Character sheets

| Species | Look (from the initial designs) | Color palette | Personality cues |
|---|---|---|---|
| **Dog** (starter) | Beagle-like puppy, tan/orange fur, white muzzle and chest, long floppy brown ears, small purple scarf or collar | Tan `#E3A35B`, white, brown ears, purple accent `#8B6CFF` | Brave, happy, open-mouth grin |
| **Cat** | Grey-and-white tabby kitten, pink inner ears, green eyes, small red collar | Light grey, white, pink, red accent | Clever, calm, slightly smug |
| **Pig** | Round pink piglet, big snout, small curled ears, gold coin necklace | Pink `#F9A8C9`, hot-pink snout, gold accent | Tough, cheerful, sturdy |
| **Bird** | Chubby green-and-blue parrot chick, orange beak, small crest, short wings | Green `#34D399`, sky blue, orange beak | Quick, cheeky, playful |

## 3. Prompts per asset

Replace `{STYLE}` with the shared style block above.

### 3.1 Avatar portrait (used in: room lists, waiting room, result, profile, HUD)
Square 2048 × 2048, head and shoulders, 3/4 view, facing slightly right.

- **Dog:** `{STYLE} Portrait of a beagle puppy with tan and white fur, long floppy brown ears, small purple scarf, happy open-mouth smile, head and shoulders, 3/4 view.`
- **Cat:** `{STYLE} Portrait of a grey and white tabby kitten with green eyes, pink inner ears, small red collar, confident smile, head and shoulders, 3/4 view.`
- **Pig:** `{STYLE} Portrait of a round pink piglet with a big snout and small curled ears, gold coin necklace, cheerful grin, head and shoulders, 3/4 view.`
- **Bird:** `{STYLE} Portrait of a chubby green and sky-blue parrot chick with an orange beak and small head crest, cheeky grin, head and shoulders, 3/4 view.`

### 3.2 Pet card art (used in: Pet management cards, Create room fighter picker)
Landscape 2048 × 1365 (3:2), character from the waist up with a soft blurred meadow behind it, so it fills the card image area.

- `{STYLE} {SPECIES DESCRIPTION}, waist-up, friendly pose, soft blurred green meadow and sunlight background, depth of field, landscape 3:2.` (Turn off "transparent background" for this one.)

### 3.3 Battle sprite (used in: Battle screen, Practice mode)
2048 × 2048, **pure side view facing right**, full body standing on the ground, transparent background.
Keep the head clearly separate from the body, because head and body hit zones differ (spec §5.5). Match the proportions in `09-battle/hitbox-guides/`.

- **Dog:** `{STYLE} Full body beagle puppy, pure side view facing right, standing in a ready-to-throw pose holding a bone in one paw, tail up.`
- **Cat:** `{STYLE} Full body grey tabby kitten, pure side view facing right, crouched ready pose holding a fish bone, tail curled.`
- **Pig:** `{STYLE} Full body pink piglet, pure side view facing right, sturdy stance holding a small pumpkin overhead.`
- **Bird:** `{STYLE} Full body green parrot chick, pure side view facing right, hovering with wings spread, holding an acorn in its feet.`

Extra frames per species (same prompt, change the pose): `idle`, `throw (arm forward)`, `hit (flinching, eyes closed)`, `win (jumping, arms up)`, `lose (sitting, dizzy stars)`.

### 3.4 Landing hero group (used in: Landing hero card, Lobby banner)
3840 × 2160, transparent background so it can sit over `landing-hero-bg`.

- `{STYLE} Group shot of four cartoon pets: a beagle puppy in front in a heroic running pose, a pink piglet behind it waving, a grey tabby kitten jumping, and a green parrot chick flying above, all excited and facing the viewer, dynamic composition, transparent background.`

## 4. Export checklist
- Transparent PNG (or WebP with alpha), sRGB.
- Avatars: export 512 / 256 / 128. Battle sprites: 1024 tall. Card art: 1200 × 800.
- Crop to the character with ~6% padding; keep the feet baseline consistent across all battle sprites.
- File names: `pet-{species}-{avatar|card|battle-idle|battle-throw|battle-hit|battle-win|battle-lose}.png`.
- Check commercial-use rights in your image generator's terms before using the art in a released product.

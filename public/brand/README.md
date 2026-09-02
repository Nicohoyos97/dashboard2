# Brand assets

Drop the real logo files here. Phase 1 (`/signin` `BrandMark`, favicon, social
previews) references these exact filenames, so keep the names as written.

The wordmark is the stacked lockup: **"Hoyos"** in navy `#0b1a3a` over
**"Baker"** in blue `#2d6cff`.

## Files to add

| Filename | Purpose | Dimensions | Format | Background |
|---|---|---|---|---|
| `logo-wordmark.png` | Sign-in `BrandMark` (renders ~96px tall) | ~480×480 (≥2× the render size) | PNG | **Transparent** |
| `logo-wordmark-dark.png` | Optional — wordmark for dark/navy surfaces (Baker stays blue, "Hoyos" in paper `#f3ece0`) | ~480×480 | PNG | **Transparent** |
| `icon.png` | Favicon / app-icon source (we generate sizes from this) | 512×512 square | PNG | Transparent or solid paper `#f3ece0` |
| `og-image.png` | Optional — social/link preview (Phase 7) | 1200×630 | PNG | Solid paper `#f3ece0` |

## Specs

- **Color profile:** sRGB. Use the exact brand hex: navy `#0b1a3a`, blue `#2d6cff`.
- **Transparency:** the wordmark + icon must have a transparent background (PNG-24 with alpha) so they sit on the cream paper surface cleanly.
- **Trim & safe area:** trim empty canvas to the artwork, then re-add ~8% padding on all sides so the lockup isn't flush to the edge.
- **Resolution:** export at ≥2× the display size to stay crisp on retina (e.g. a 96px BrandMark wants ≥192px of real pixels; 480px gives headroom).
- **Square icon:** center the "HB" monogram or the stacked lockup in a square with even margins; avoid text that becomes illegible at 32×32.
- **SVG is welcome too:** if you have vector source, add `logo-wordmark.svg` alongside the PNG and we'll prefer it (sharper, themeable). PNG remains the required fallback.

## Not committed

Real binary assets are provided by the client and added here directly. This
README is the only file checked in until then.

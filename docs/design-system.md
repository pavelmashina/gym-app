# Gym App design system

Status: active app-wide UI contract. `src/design-system.css` defines shared tokens; `src/design-system-audit.css` and `src/ui-layout-audit.css` are loaded after it to normalize legacy surfaces and mobile layout edge cases.

This file is the source-of-truth companion to `src/design-system.css`. New screens should reuse these tokens rather than introduce one-off dimensions.

## Layout
- Mobile canvas: max 430px.
- Horizontal page inset: 18px (16px on <=370px).
- Spacing scale: 4, 8, 12, 16, 20, 24, 32px.
- Default card gap: 12px; section gap: 24px; card padding: 18px.

## Typography
Single UI family: Inter, weights 400/500/600/700/800.
- Display: 32/36, 700.
- H1: 28/32, 700.
- H2: 20/24, 700.
- H3: 16/21, 600.
- Body: 14/20, 400.
- Caption: 12/16, 500.
- Micro: 10/13, 600-700.

## Components
- Radii: 12px small, 16px control, 24px card, 28px hero.
- Primary controls: 50px high, 16px radius.
- Nested topbar controls: 44x44px.
- Catalog images: 96x96px.
- Visual section tabs: 72x72px icon tile.
- Bottom navigation: 72px high, 24px icons, 10px labels.
- Use the neutral surface/background/ink palette already defined in `styles.css`; semantic color is reserved for status/warning/error/success.

## Rules
1. Do not add a new font size, radius or page inset without first checking existing tokens.
2. Root screens use a section title + visual navigation where needed; detail screens use one centered nested topbar and do not repeat the parent section navigation.
3. Lists in catalog-style screens use the same image/card geometry.
4. Forms use consistent 50px controls and labels.
5. Active workout may hide bottom navigation; ordinary detail screens keep app navigation according to their current product flow.
6. All interactive elements need visible focus and reduced-motion support.


## Date and period labels
- Date/day badges must size from content and stay within the parent container.
- Do not use fixed widths for variable-length dates.
- Prefer `min-width: 0`, `max-width: 100%` and wrapping over clipping or ellipsis when the full date is important.
- Program schedule/detail day badges share the same compact geometry: minimum height 34px, small radius and content-sized width.
- Period labels in statistics may wrap on narrow screens; they must not overflow the period selector.
- Date rows must reserve a fixed area only for controls/icons, while the date text remains flexible.

## Layout resilience
- Any flex/grid child containing user or database text should use `min-width: 0`.
- Long exercise/program names use `overflow-wrap: anywhere` instead of forcing horizontal page overflow.
- Variable-content cards use `min-height` rather than fixed `height`.
- Do not repair overlaps by adding arbitrary `z-index` or hiding overflow; fix the grid/flex sizing and spacing.

## Supplement detail page
- The original full-width media block is **230px high** (`--detail-hero-image-height`) and **24px radius** (`--sportpit-photo-radius`). Keep its dimensions when changing the image.
- Photos keep their original aspect ratio and touch whichever pair of edges (top/bottom or left/right) fits first. Missing side bands are synthesized from blurred edge strips of **the same image** in `src/lib/supplementPhotoEnhancement.js`; the subject is not cropped.
- The catalog thumbnail and product detail must show the **same central photo**: `item.image_url` if supplied, otherwise `SPORTPIT_IMAGES[item.slug]`. The detail version synthesizes side textures from that photo only and applies gentle sharpening. This is deterministic compositing, **not AI generative outpainting**; high-quality originals are still needed for truly sharp detail.
- Detail screens use 18px page gutters (16px on narrow viewports), 8px / 12px / 16px spacing steps, H1 28/32, H2 20/24, body 14/20, captions 12/16, and card radius 24px / padding 18px.
- The supplement product page hides the bottom navigation and exposes the catalog underneath the page during a right-edge swipe-back gesture.
- A back swipe begins within 48px of the **left** edge, tracks finger movement 1:1, springs back when cancelled, and completes smoothly when released beyond the completion threshold. Modal dialogs are never bypassed by the gesture.

- Sportpit detail top bar shows the **individual supplement title**, centered alongside the `i` disclaimer control; do not display the generic "СпортПит" title there or duplicate the supplement title below the image.
- The detailed category label (e.g. "Белковая добавка") is hidden; the first text under the hero image is the description.
- Text in the product description, recommendation paragraphs, composition rows, warning copy and informational notes is justified (`text-align: justify`), with automatic hyphenation where supported.

## Typography and spacing — sportpit detail (current)
- Family: **Inter**, fallbacks Arial/sans-serif.
- Product title in topbar: **28px / 32px**, weight **700** (H1, enlarged from 18px). It may wrap at word boundaries but cannot break words with hyphens.
- Section headings: **20px / 24px**, weight **700**; description, recommendations and composition: **14px / 20px**, weight **400**, muted color.
- Secondary captions and notices: **12px / 16px**, weight **500**. Info icon: **12px** in a **22×22px** circle.
- Page horizontal padding: **18px** (16px on narrow screens); between sections: **16px**; below heading: **12px**; text group spacing: **8px**.
- Sportpit cards: **16px** inner padding (`--sportpit-card-padding`), **24px** rounding, 12px between independent card items.
- Photo container: **230px** high with **24px** rounding. The photo fits its full height or width without cropping, while remaining margins are filled from its own border textures. Rendering is up to **2× device resolution** with light edge sharpening; native detail cannot be restored from the original 128×128px sources.
- Composition format: heading → **1px divider** → bulleted list; **12px** between divider and bullet content; **8px** between bullet items; matching body font/color/line-height of recommendations.
- Justified body text has **no automatic hyphenation** (`hyphens:none`); natural wrapping between whole words remains enabled.

## Pull-to-refresh gesture
- Starts only when the active page is scrolled to the top; swipe-back has priority within the leftmost 50px, and modals are excluded.
- Dragging down gradually reveals the loading wheel; a strong **150px downward gesture** is required to refresh. A shorter pull cancels, without reloading.
- Refresh remounts ordinary non-workout pages to fetch current data; supplement details stay open while catalog entries are refetched. Active workout screens are excluded to avoid resetting in-progress sets.

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
- The original full-width media block is **230px high** (token `--detail-hero-image-height`), 28px radius. Do not change the block's size when changing an image.
- Photos use `object-fit: contain` and keep their aspect ratio. Letterbox space is filled by the existing background gradient, never by stretching or cropping the image.
- The **catalog thumbnail and its product detail must show the exact same image**: use `item.image_url` when provided, otherwise the same bundled `SPORTPIT_IMAGES[item.slug]` fallback on both. Never replace the selected image with a different category photograph. Detail clarity is limited by source quality; use higher-resolution versions of the same image when available, without inventing alternative imagery.
- Detail screens use 18px page gutters (16px on narrow viewports), 8px / 12px / 16px spacing steps, H1 28/32, H2 20/24, body 14/20, captions 12/16, and card radius 24px / padding 18px.
- The supplement product page hides the bottom navigation and exposes the catalog underneath the page during a right-edge swipe-back gesture.
- A back swipe begins within 48px of the **left** edge, tracks finger movement 1:1, springs back when cancelled, and completes smoothly when released beyond the completion threshold. Modal dialogs are never bypassed by the gesture.

- Sportpit detail top bar shows the **individual supplement title**, centered alongside the `i` disclaimer control; do not display the generic "СпортПит" title there or duplicate the supplement title below the image.
- The detailed category label (e.g. "Белковая добавка") is hidden; the first text under the hero image is the description.
- Text in the product description, recommendation paragraphs, composition rows, warning copy and informational notes is justified (`text-align: justify`), with automatic hyphenation where supported.

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

## Sportpit 2026-11-01 refinements
- Above the search field, show one compact neutral disclaimer strip with an outlined information icon; match the catalog UI reference and avoid a second advisory block below the search.
- During pull-to-refresh, the **entire active screen moves down with the finger** with resistance until 104px. Beyond 150px of actual gesture travel, releasing holds the screen at 76px while refresh runs, then springs back. Short pulls spring back without refreshing.

## Generated sportpit image assets
- Image pipeline: use the original photo in the detail and the corresponding thumbnail of the **same photograph** in the catalog. The browser chooses `public/assets/sportpit/hero/<slug>.webp` or `.../thumbnail/<slug>.webp`.
- Supported slugs: `protein`, `gainer`, `creatine`, `bcaa`, `omega3`, `vitamins`. Product records are still controlled by Supabase; adding an asset never invents a catalog record.
- All **18 binary WebP images are committed in the repository** under `public/assets/sportpit/{hero,square,thumbnail}/`. Each of six categories has a 1200×700 hero, 1024×1024 square and 256×256 thumbnail. If a generated asset fails, the UI falls back to the current Supabase image and then the bundled backup image.
- Generated asset archive: `gym_sportpit_generated_assets.zip` has high-resolution 1024×1024 originals, 1200×700 hero variants and 256×256 thumbnails. Paths inside that archive are relative to `public/assets/sportpit/`.

## November 2026: stable refresh and expandable sportpit disclaimer
- During touch dragging the page offset is held in `html.gym-pull-active` and `--gym-pull-offset`, so content can remount without resetting its vertical position. Touch updates are coalesced with `requestAnimationFrame`; no `position:relative` flip occurs during dragging.
- After release beyond 150px, the page remains at 76px until the refresh promise finishes; the loading indicator has highest app `z-index` and stays above the page. Only after completion does the page animate back over 300ms.
- Sportpit refresh waits for the actual catalog fetch's completion event, with a bounded failsafe. Other screens use a minimum loading interval.
- Sportpit's introductory disclaimer shows exactly two lines by default using line clamp. The user can expand it with “еще” and collapse it using “скрыть”; the control is focusable and exposes `aria-expanded`.
- Nutrition bottom navigation icon: the knife blade points left, toward the fork.

## Refinement: two distinct photo formats, fixed refresh label, inline disclaimer
- Sportpit cover cards use the 1024×1024 `square` photo; the individual supplement page uses the 1200×700 `hero` photo in a full-width, 230px-tall, 24px-radius frame.
- Generated high-resolution hero images display directly with `object-fit:cover`, without lower-quality canvas repainting; only legacy fallback images use the image-extension compositor.
- In the collapsed sportpit disclaimer the text and “еще” button fit **together** within exactly two 16px lines. The expansion button overlays the end of line two. Expanded “скрыть” stays beneath the full text.
- The refresh indicator always reads “Обновление”; gesture-driven transforms update once per animation frame directly (without a React render on each touch move). CSS transition applies only to the release/return animation.
- The nutrition icon knife is moved 1.25 icon units farther from the fork, keeping its blade pointed toward the fork.

## 2026-11-01 — Seamless supplement photography replacement
- Replaced all 18 binary WebP assets for six categories with new generated photographs, not edge-blurred enlargements of the old pictures.
- Each category has a **1200×700** seamless wide `hero` (detail), a matching **1024×1024** `square` (catalog cover), and a **256×256** `thumbnail`. Cover and detail depict the same updated product artwork.
- All photo files reside at `public/assets/sportpit/{hero,square,thumbnail}/<slug>.webp`; they are committed as Git binary blobs and checked by the photo asset CI audit.
- The rendered URLs include `?v=20261101-seamless` to prevent browsers/CDNs from reusing the previously cached photos.

## Nutrition: standardizing the three tabs
- Preserve one root screen title “Питание” and the three navigation tabs. Remove all repeated calculator headings/eyebrows and introductory copy below the tabs; the tab label “Калькулятор КБЖУ” remains for navigation.
- “Рецепты” and “Готовые рационы” start directly with catalog filters and favorites controls. Remove the duplicated “Каталог” / “Избранное” eyebrow, section heading, and item-count pill; **do not** remove navigation labels, favorites filtering, results or empty states.
- `src/nutrition-standard.css` is the final scoped typography and spacing layer for nutrition, loaded after shared style audits. It reuses the tokens in `src/design-system.css` for the calculator, catalogs, recipe details and meal-plan details.
- Typography: H1 **28/32** bold, H2 **20/24** bold, catalog item titles **16/21** semibold, regular text **14/20**, labels/captions **12/16**, micro tags **10/13**. Tab labels follow the established **11/14** compact navigation standard.
- Spacing: page inset **18px** (small screen adaptation is in shared styles), subview/content sections **16px**, lists **12px**, card padding **18px**, form label/input spacing **8px**, calculator controls **50px** tall, card radius **24px**.

## Root header → first content block: Nutrition and SportPit
- Both root screens render the same `RootSectionHeader` component: identical top/bottom padding and title typography.
- The first content block begins **8px below the shared header boundary** via `--space-2`, enforced by `.root-section-header + .nutrition-content` and `.root-section-header + .sportpit-content`.
- The Nutrition visual-tabs strip has **0px top padding**; its first icon tiles align vertically with the top of the SportPit disclaimer card. Bottom padding of the tabs remains **8px**.
- The calculator begins immediately with the “Ваши данные” card under the navigation strip; it has no duplicate “Калькулятор КБЖУ” heading in the content area.

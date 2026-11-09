# Gym App design system

Status: active app-wide UI contract. `src/design-system.css` defines shared tokens; `src/design-system-audit.css` and `src/ui-layout-audit.css` are loaded after it to normalize legacy surfaces and mobile layout edge cases.

This file is the source-of-truth companion to `src/design-system.css`. New screens should reuse these tokens rather than introduce one-off dimensions.

## Layout
- Mobile canvas: max 430px.
- Horizontal page inset: 18px (16px on <=370px).
- Spacing scale: 4, 8, 12, 16, 20, 24, 32px.
- Default card gap: 12px; section gap: 24px; card padding: 18px.

## Typography — canonical GYM APP scale (mandatory for new/edited UI)
Single UI family: **Inter**, Arial fallback. All ordinary UI text must use the **six** sizes below.
The CSS source of truth is `src/design-system.css`; `AGENTS.md` makes this a required contract for any developer or AI agent.

| Tier | Size | Token | Typical UI role |
| --- | --- | --- | --- |
| XL | **24px** | `--gym-type-xl` | Page and feature headings |
| L | **20px** | `--gym-type-l` | Section headings |
| M | **16px** | `--gym-type-m` | Subheadings, prominent labels |
| S | **14px** | `--gym-type-s` | Main body, cards, field/filter headings |
| XS | **12px** | `--gym-type-xs` | Controls, descriptions, filter options |
| XXS | **10px** | `--gym-type-xxs` | **Training upper tabs, small tags inside cards** and other very compact metadata |

Use available line-height tokens (e.g. 20px body, 16px caption, 13px micro) and weights 400/500/600/700, 800 only where already required. **Do not add other font sizes, including 8/9/11/13/15px,** or use automatic uppercase on filter headings. Do not use a font size to compensate for a broken container width—fix the layout.

**Legacy caveat:** existing `--text-display:32px` and `--text-h1:28px` and some historical local CSS declarations remain for screens not yet migrated. Do not change them globally without an explicit cross-app migration. All newly built components and affected text in edited screens follow the six-step scale.

### Training: Recommendations + Catalog — exact text sizes

| Element | Font size |
| --- | --- |
| Top navigation labels “Рекомендации”, “Каталог” and peers | **10px** |
| Search | 14px |
| Toolbar “Создать” and sort options | 12px |
| Recommendations “Пока пусто” | 16px |
| Recommendations empty-state description | 12px |
| Catalog program title | 14px |
| Program card tags (place, duration, type etc.) | 10px |
| Catalog empty-state explanation | 10px |
| Filter headings “Место”, “Направление”, “Уровень” | 14px, sentence case, never uppercase |
| Filter option pills (Все, Силовой etc.) | 12px |
| Filter reset button | 12px |

Rules are implemented in `src/training-catalog-standards.css`, imported after other style sheets in `src/main.jsx`. Matching regression assertions live in `tests/training-typography-standard.mjs`.

### Training → Exercises — unified Base / My catalog

- The former separate “Мои упражнения” upper tab was removed. The single “Упражнения” tab contains a two-way text switcher **База / Мои упражнения**.
- Search bar is followed by a single compact row containing **Группа мышц**, **Оборудование** and the same outlined **+ Создать** button used for creating a training program. Filter values use **10px**, labels use **12px**. Keep the three controls on one line on mobile.
- Exercises are displayed in standard horizontal list cards. There is **no right chevron**. The circled **i** icon has no surrounding tile/background. Tapping the row or the i icon opens the full-screen details screen, not a bottom sheet.
- Both filters have **12px selected values**; the Base/My switch uses reduced upper spacing and a close underline.
- The exercise detail screen displays video/animated GIF or an outlined **«Видео пока нет»** placeholder above the description. Description initially shows at most **five lines**; **«Подробнее» / «Скрыть»** controls the rest, including additional technique sections.
- Details: eyebrow **«Упражнение» 16px**, not uppercase; exercise title **14px**; muscle/equipment tags **12px**; **«Описание» 16px**; description/technique text **14px**. Existing photos, videos and long-form technique remain accessible.
- Creation and editing use a standalone full-height screen with a back arrow. The standalone form has **no enclosing layout block** (`display: contents`, native form semantics retained). The screen title is **20px**, field labels **16px**, and “Отмена” / “Создать” actions **14px**. The redundant **«Новое упражнение»** heading and **«Обязательные поля отмечены *»** note are hidden on this page; required field asterisks remain. Video-divider **«или»** stays **10px**.
- Owner-only edit/delete actions remain on the detail screen; deletion still safeguards exercises used in programs and workout history. The library picker in the workout editor is intentionally separate and continues to support multi-selection.
- Source files: `src/components/TrainingExerciseBrowser.jsx`, `src/training-exercise-browser.css`; checks: `tests/training-exercise-browser.mjs`.

### Bottom navigation
Five equal-sized buttons, from left to right: **Главная → Тренировки → Статистика → Питание → Спортпит**. No raised or outlined central icon. The active section uses an **inset radial gradient** fading from stronger center color to transparent outer edges, with room between the highlight and outer dock border. Preserve this effect; do not substitute a solid block.

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

## November 2026 — Refresh without losing the open page
- A pull-to-refresh **never remounts root views** using `key={pullRefreshKey}`. Instead, the current component receives `refreshKey` and re-fetches data inside effects. Active tabs, filters, selected date, open recipe and meal-plan detail, workout program detail, and ongoing local form state remain intact.
- On Nutrition: recipe and meal-plan list effects respond to `refreshKey` without clearing already visible entries. Nutrition sends `gym-nutrition-refresh-complete` when the relevant tab's query ends. An open plan's meal details reload in place.
- Training programs, Statistics, Home calendar, Settings and Account avatar reload using `refreshKey` without replacing the current component.
- SportPit retains its existing non-remounting refresh behavior.

## November 2026 — Local photography for Recipes and Meal Plans
- All **16 distinct existing Unsplash photo IDs** in the active `recipes`, `meal_plans`, and `meal_plan_meals` tables have been saved as JPEG files in `public/assets/nutrition/photos/`. The same images are served by GitHub Pages for all users, avoiding cross-network access to Unsplash on client devices.
- The unreachable URL `photo-1571212515416-fca77afa66ee` returned 404; its local file is a matching cottage-cheese photograph (the successful `photo-1490645935967-10de6ba17061` source).
- `nutritionImageSrc` resolves known Unsplash references to GitHub Pages assets; unknown image sources preserve their original URL and failed image loads show a neutral image placeholder instead of a broken icon.
- `scripts/mirror-nutrition-images.mjs` records and verifies the upstream sources; workflow exists for reproducible downloads. It does **not** re-download during routine app builds.

## Training / nutrition detail polish — November 2026
- Recipe and meal-plan detail pages hide the bottom app navigation, but only while nested details are displayed. Increase detail-page bottom padding to 76px and content bottom padding to 64px, allowing users to scroll the last card farther up.
- On a meal-plan detail page, horizontal touch gestures on the image switch meals: left = next, right = previous, minimum 55px horizontally and predominantly horizontal. The 48px left edge is reserved for native swipe-back, and indices clamp to existing meal range. Dots and previous/next controls remain.
- Training tab icons are selected via `data-training-tab` IDs instead of nth-child positions: recommendations sparkles, catalog grid, mine bookmark, received arrow into a tray, completed checkmark, create plus-square.
- Training section headers do not repeat tab names or the generic label “Программы”. Catalog counters are suppressed; on My Programs the create-program button appears before filtering/sorting controls.
- The received-program form follows shared typography/spacing tokens, with a short instruction instead of another heading.
- If a valid locally saved new-program draft exists, tapping Create displays an accessible choice popup **before** the editor. Continue restores the draft untouched, Start over explicitly deletes the draft before opening an empty editor, and Cancel leaves the user on Training. Invalid drafts offer only a safe start-over option.

## Training program detail unification & update notice
- Training list cards use **square 104×104 photo boxes**, exactly like Recipes and Ready Meal Plans; images are absolutely positioned with object-fit:cover so arbitrary aspect ratios cannot stretch or shift the card.
- Both catalog and personal program detail pages reuse `ProgramOverviewIntro`, `ProgramOverviewStats`, and `ProgramOverviewMeta`, with the same order: cover → name/description/categories → state/action → metrics → metadata → workouts. Personal pages retain their live scheduling, editing and sharing. Catalog programs show their cycle and a join action, but no share button.
- The Receive Program tab has no duplicate Create Program button. Training tab symbols are 40×40 CSS background images and share a single pixel size across all six tab tiles.
- The GitHub Pages workflow embeds `VITE_APP_BUILD_ID=github.sha` in the Vite bundle and writes `dist/version.json` with that SHA only after a successful build. The active app checks the deployed manifest every 90 seconds and on focus/visibility; when it differs, a small update icon (see below) offers an explicit hard-navigation to the new build, preserving URL/share parameters. Never prompt on local `dev` builds or when offline.

## New version icon — November 2026
- The bottom banner «Доступна новая версия GYM APP / Обновить» is replaced by a **36px round icon in the top-right corner** of the app column: two circular arrows chasing each other with a small **«!» at their bottom right**. Ink background, surface-coloured strokes, float shadow; it inverts with the dark theme.
- Tapping the icon itself performs the hard-navigation; the arrows spin while the new build loads. Screen readers hear «Доступна новая версия GYM APP» once, and the button is labelled «Доступна новая версия GYM APP. Обновить».
- Placement, below the safe area:
  - nested top bars (the `min-height:64px` list in `design-system.css`): centred in the bar's empty 44px right slot, mirroring the back button, with a 44px touch target;
  - program details: in the back-button row;
  - home and the account screen, whose right slot already holds the profile or settings button: 10px to the left of that button;
  - any other screen without a known top bar: 4px from the corner (fallback).
- Not shown:
  - root tabs without a top bar (Тренировки, Статистика, Питание, СпортПит), including their modal sheets. A detail opened inside a tab (program, recipe, meal plan, sports nutrition item) has its own top bar and shows the icon;
  - workout result screen, because «Готово» occupies that corner; the icon reappears on the next screen.
- On screens wider than 430px the icon stays at the edge of the centred app column, not the window.

## Program description and workouts sections
- Both catalogue and user-created program pages share a two-option top switcher: **Описание** / **Тренировки**, reusing `ProgramDetailTabs`.
- The Description section shows program cover/name/categories, statistics and characteristics, plus sharing/participation status for personal programs. The Workouts section shows the training cycle with exercises, or the personal program's schedule and workout structure.
- The catalog-only introductory status box “Программа из каталога” / “Присоединитесь, когда будете готовы” is removed. The **Присоединиться к программе** action stays in the fixed bottom footer.

## Program detail header and deletion — November 2026
- The shared Description/Workouts tabs sit **inside** the top detail bar, replacing the title “Моя программа” or “Программа”; there is no extra row.
- After the photo show name, optional description, then larger category and creation-fact chips (place, equipment, level), then metrics.
- Remove the large “Активна” status card while keeping pause/resume/complete and start-date editing as unframed management controls.
- At the bottom of a user-created program’s Description content, show **Удалить программу** followed by **Поделиться программой**. Never show these actions for catalog-adopted programs.
- Deleting requires confirmation and archives a user-owned program, preserving historic sessions and honoring existing foreign keys. An active or paused program must be completed first. Refresh the list after successful archival.

## Restore compact program fact cards and hide main navigation
- The program-detail stats (“Этапы”, “Тренировок”, “Упражнений”, “Циклов”, etc.) again use their original compact 3-column card geometry from `src/program-detail.css` (67px minimum height).
- “Место”, “Оборудование” and “Уровень” again appear in the original single metadata card with horizontal rows (52px minimum height), including “Нет данных” fallback where applicable.
- Do not show the common 5-item bottom app navigation on either personal or catalog program detail (`body:has(.program-detail-phone) .app-bottom-nav`). The dedicated program action footer remains accessible.

## Program detail typography and custom exercise photos — November 2026
- The Description/Workouts detail header switcher has only labels, no border or filled pill. The active label is black with a 2px underline, inactive labels muted.
- Program details reuse standard typography: 12/16 for metadata labels, 14/20 for values and body, 20/24 for heading/metric values, 16px main section rhythm. Place/Equipment/Level remain rows inside the original unified metadata card rather than independent tiles.
- Users can add a photo to a newly created private exercise or upload, replace, remove an image while editing it. JPEG, PNG, WebP up to 8 MB. Photo preview and thumbnail appear within the exercise library and detail sheet.
- The database stores a `photo_path` string in `public.exercises`; images are stored in the **private** Supabase `exercise-photos` bucket, with RLS permissions restricted to an authenticated user's folder. The existing v2 catalog view is not modified; owner-specific photo paths are loaded separately from `public.exercises`.
- New photo uploads are kept only after successful exercise row update. Replacing/removing a photo cleans up the old object; an error leaves the existing photo intact. Existing exercise video behavior is preserved.

## Multi-photo galleries for custom exercises
- Up to **10 photos per exercise** (JPEG, PNG, WebP; max 8 MB each), selected together or appended later. Editing supports individual removal, with changes committed only when the form is saved.
- `photo_paths text[]` contains ordered file paths. Earlier `photo_path` entries are backfilled as the first photo; `photo_path` continues to store the first/cover image for compatibility.
- Custom exercise cards show swipeable photos with arrows and pagination. Tap an image to open a full-screen viewer with swipes, arrows, keyboard navigation and Escape to close.
- Files remain private in `exercise-photos` Storage; old objects are deleted only after successful database update. Other users cannot fetch the photos.

## 2026-11-04 — Showcase catalog only, preserving personal programs
- The shared catalog (`public.catalog_programs`) temporarily contains **one published demonstration program**: **«Полное тело · 3 тренировки в неделю»** (`source_key=gym-complete-fullbody-3day-demo-v1`).
- The original 42 imported catalog programs are **unpublished**, not physically deleted. This is deliberately reversible: their content and any existing references from user-owned program copies remain intact. Do not modify `public.programs`, enrollment, schedules or workout history for this cleanup.
- New showcase: full description, four tags, training location, equipment, level, three complete workouts (18 exercise slots, 16 unique canonical exercise names), numeric approach/repetition prescriptions, an 8-week recommended schedule, progression and warm-up advice.
- The source payload additionally includes `cover_image=fitness-club-banner.webp`, and `details` with duration, goal, frequency, schedule, rest, progression and cooldown. Both the catalog list cover and the shared detail hero reuse the existing image hosted under `assets/fitness-club-banner.webp` and resolve it through Vite `BASE_URL`.
- `CatalogProgramFacts` renders optional extended attributes within the **Описание** tab, without introducing a new card section or affecting user-owned detail pages.
- The public catalog UI must continue to filter `published=true` in both list and individual lookup, never surface unpublished rows through search.

## Program tags and selectable characteristics — 2026-11-04
- Mini-tags are directly below the program title and above the description. `CATEGORY_OPTIONS` is the only source for newly selected category tags.
- `PLACE_OPTIONS`: Тренажёрный зал, Дом, Улица, Неважно. `EQUIPMENT_OPTIONS`: Полный зал, Свободные веса, Тренажёры, Минимум оборудования, Без оборудования. `LEVEL_OPTIONS`: Начальный, Средний, Продвинутый.
- Dropdowns for other optional characteristics: Goal, Duration, Frequency, Training time, Schedule, Recovery, Progression, Warm-up and After training. Choices persist in the private user's `public.programs.details` JSONB field.
- Numeric cards for stages, workouts and exercises derive from the structure and are not manually selected.
- Workout views no longer display the word Структура; counts use body typography. Expanded workout exercises show only sets/reps/rest and never freeform technique notes.

- Catalog adoption now copies any selected attributes from `catalog_programs.source_payload.details` into the newly created user's `programs.details` in the same transaction, using an invoker trigger. This keeps the catalog and joined personal-program detail cards consistent.
- Existing published demonstration catalog program is normalized to four selectable category tags: `Всё тело`, `Силовые`, `Набор мышечной массы`, `3 раза в неделю`, with `Полный зал` equipment and selected options for all nine extra fields.

## 2026-11-05 — Program schedule, completed workout editing and push lifecycle
- Personal-program detail has two common tabs (Описание, Тренировки); the third, График, is visible only when the program's current participation is active. Tabs are positioned below the back arrow. A 100dvh flex shell scrolls only its content, with space for fixed primary actions.
- Descriptions now appear as a 5-line white card after the compact Место/Оборудование/Уровень metadata; show Подробнее/Скрыть for overflow. The catalog detail omits the Cycle/In cycle/Repeats stats trio.
- Root headings on Training, Statistics, Nutrition and SportPit are suppressed. Training uses a compact horizontal tab nav, 42px search, icon-only filter/sort and outlined Создать button on three tabs. Personal programs are separated into currently active/paused runs and personally authored templates; completed tab loads ten most recently completed runs.
- Finished workouts open their saved results and support correction of the completion date (today or earlier) and each legacy weight/repetition. `completed_on` overrides the display/statistics date while preserving `ended_at` for audit. Scheduled workouts can be manually marked completed: previous matching exercise+set weights and repetitions are copied only if they exist; otherwise weights remain blank, and the result stays editable. All writes use owner-checked RPC and existing per-set RLS.
- A private Supabase pg_cron job checks workouts every minute. After 30 minutes without persisted set activity, it queues a reminder; after 3 hours from start it auto-completes the workout and preserves logged sets. The Edge sender reads queued reminders and sends Web Push to subscribed devices, respecting user settings. Cron passes a Vault-backed token through pg_net; the Edge function validates it via an access-restricted RPC. Private VAPID key exists only in Supabase Vault; the public VAPID key is a build-time browser setting.
- Browser notifications require user permission and an active browser subscription; install the PWA to enable supported mobile push (iOS requires Home Screen installation). The user can enable push under Настройки → Уведомления. Delivery for a particular device must be verified on that device.

## Exercise card in an active workout — November 2026
- One stylesheet, `src/workout-exercise-card.css`, owns the card; the old card rules were removed from `workout-session.css`, `workout-session-active-v2.css`, `-v3.css` and `-figma.css`. Results v2 rows (`ResultSetV2`) keep their rules in `workout-session-active-v3.css` but use the same columns, sizes, icons and type scale.
- Order: eyebrow «N · muscle group» → exercise name with an **info icon** (tapping the name opens the exercise information, so the icon belongs there) → prescription, if any → column head → set rows → one row of three equal buttons **«+ Подход» · «+ Разминка» · «История»** → «Заметка» and the note field.
- «История» opens the former «Предыдущий результат» sheet (best set and last result). Its icon is a clock turning back, never the info icon.
- Type scale, nothing else: eyebrow and column head 10/13 (700/600, uppercase), buttons 12/16 600, set number 14/20 700, name 16/21 700. Inputs and the note stay at 16px so iOS does not zoom on focus.
- Controls are 32px high: weight and reps fields (10px radius), the ✓ and delete buttons, the three action buttons and the «⋯» menu. A set row is 40px. The buttons are plain filled tiles (`--surface-2`), without dashed outlines.
- The unit is named once, in the column head («кг» or «lb»); an empty weight shows «—», an empty reps field shows the planned reps. A list made only of results v2 rows hides the column head, because those rows label their own fields.
- The note has the short caption «Заметка» (10/13, like the column head) and no hint: one 36px line with «…» as the placeholder. It grows to two lines while focused or filled, and up to 140px with its content where `field-sizing` is supported.
- Colours come only from theme tokens, so the card follows the dark theme. A completed set is tinted `color-mix(in srgb, #2e9e57 13%, var(--surface))`; its ✓ button is filled with `--ink`.

## Set order in the exercise card — November 2026 (#60)
- The card has two kinds of set rows. Weight × reps rows serve exercises without a measurement contract (custom exercises, old records). Results v2 rows (`ResultSetV2`, with field captions and «Настройки выполнения») serve catalog exercises whose contract says how load is measured, for example «Вес одного снаряда, кг» for dumbbells. A card can hold both kinds.
- Both kinds share one order, built in `src/lib/setOrder.js`: warm-up sets first, then working sets, each group in its stored order. Labels follow the shown order: «Р1, Р2…» for warm-ups (muted number), «1, 2…» for working sets. CSS no longer reorders rows.
- «+ Разминка» adds the warm-up under the last warm-up, above the working sets, on either kind of row. The order is also stored on the server, so the history and the next load agree with the screen.
- The set number is the drag handle: hold it for 250 ms, then drag the row up or down. A swipe that starts on the number moves nothing (the number has `touch-action: none`, the rest of the row scrolls as before). The lifted row gets a shadow and `--surface`, numbers update while dragging. A warm-up cannot go below a working set, and a working set cannot go above a warm-up.
- Releasing saves the whole order with one call (`reorder_performed_sets`), so it is never half-saved. If the save fails, the rows return to where they were and the footer shows «Не удалось сохранить порядок подходов.». A set that is still being created cannot be dragged.
- Styles: `src/workout-set-order.css`. Checks: `tests/workout-set-order.mjs` (`test:ui-audit`), `tests/set-order-db.mjs` (`test:lifecycle`).

## Adding an exercise to an active workout — November 2026 (#61)
- Every active workout, from a program or standalone, ends with a full-width **«Добавить упражнение»** button with a plus icon under the last exercise card: 48px high, `--radius-md`, `--surface` with a `--line` border, 14/20 600 in `--ink`, the icon 18px. It keeps the same `--card-gap` as between the cards and scrolls with them; the fixed footer never covers it.
- A workout without exercises shows the hint «Пока нет упражнений. Добавьте первое, затем укажите подходы и результаты.» above the button; a standalone workout adds «Ничего из программы не копируется.». The button used to sit above the list and existed only in standalone workouts.
- The button opens the exercise picker as a bottom sheet («Текущая тренировка» / «Добавить упражнение»), the same sheet as «Заменить упражнение». The exercise goes to the end of the workout with one empty working set.
- In a workout from a program, picking an exercise first asks **«Куда добавить упражнение?»** over the picker, in the scope sheet that «Переместить упражнение» already uses: the exercise name as the title, the note «Во всю программу — упражнение появится и в следующих таких же тренировках. Завершённые тренировки не изменятся.», then **«Только в эту тренировку»** (primary), «Во всю программу» and «Отмена», which goes back to the picker. The tapped answer reads «Добавляем…» while it is saved. A standalone workout has no program, so it adds at once.
- «Во всю программу» also appends the exercise, with one set without planned reps, to the program workout this one was made from and to every such workout that has not started yet. Finished, skipped and started workouts keep their plan.
- A failure goes back to the picker («Не удалось добавить упражнение.») so the user can try again; closing the picker dismisses it.
- After adding, the sheet closes and the new card is scrolled fully between the top bar and the footer. A card whose last set was deleted hides the «кг / Повт.» column head.
- An exercise added only to this workout has no program exercise behind it, so while the workout holds one, «Переместить упражнение» offers only «Только в этой тренировке». One added to the program can be moved in all such workouts too.
- Styles: `src/workout-exercise-adder.css`; the question raises `.reorder-scope-shell` above the picker (z-index 100 over 90). Checks: `tests/workout-add-exercise.mjs` (`test:ui-audit`), `tests/session-exercise-add-db.mjs` (`test:lifecycle`).

## Dark theme of the active workout — November 2026
- Outside the exercise cards, the active workout takes its colours only from the tokens that the dark theme redefines: `--bg`, `--surface`, `--surface-2`, `--ink`, `--muted`, `--line`. `--accent`, `--accent-soft` and `--muted-2` keep their light values on the dark theme, so these blocks do not use them.
- Accent blocks are filled with `--ink` and written in `--surface`: the «Тренировка идёт» header, «Завершить тренировку», the running rest timer, «Лучший подход» in the history sheet, the active unit and rest choice, and the primary buttons of the popups. On the dark theme they invert into light plates with dark text. Translucent details on them (caption, timer chip, progress track, timer buttons) are `color-mix(in srgb, var(--surface) N%, transparent)`.
- The «⋯» menu and the order confirmation use `--surface`; the exercise order and exercise information sheets and the bottom sheets use `--bg`; neutral buttons use `--surface-2`; separators use `--line`. Secondary greys that were lighter than `--muted` are `color-mix(in srgb, var(--muted) N%, var(--surface))`, so the light theme keeps its shades.
- «Поставить на паузу» and «Удалить упражнение» share `--workout-danger: color-mix(in srgb, #bc3f3f 75%, var(--ink))`: dark red on the light theme, soft red on the dark one.
- Scrims, shadows and the video frame of the exercise information stay dark on both themes. Error boxes keep their light pink background with dark red text, which is readable on both.
- `tests/workout-dark-theme.mjs` (part of `test:ui-audit`) fails when one of these rules gets a literal colour or a token that the dark theme does not redefine.

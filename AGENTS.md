# GYM APP — mandatory implementation standards for AI agents and developers

**Read this file before changing UI.** The source of truth is
[`docs/design-system.md`](docs/design-system.md) and the design tokens in
[`src/design-system.css`](src/design-system.css). The current React/CSS layout
must be inspected as well: older style sheets contain legacy values that are
overridden by later, more specific selectors.

## Typography — APPROVED scale

Inter (`--font-sans`, Arial fallback). Use **only these six sizes** for
new or modified interface text:

| Tier | Size | CSS token | Typical use |
| --- | --- | --- | --- |
| XL | **24px** | `--gym-type-xl` | main page/feature title |
| L | **20px** | `--gym-type-l` | section title |
| M | **16px** | `--gym-type-m` | subsection title, prominent card title, empty-state heading |
| S | **14px** | `--gym-type-s` | ordinary text, standard card title, filter heading |
| XS | **12px** | `--gym-type-xs` | toolbar labels, filter options, helper text |
| XXS | **10px** | `--gym-type-xxs` | **upper Training tabs, small tags in cards**, compact secondary metadata |

Do not introduce 8, 9, 11, 13, 15, 17, 18px etc. as new text sizes.
Existing legacy `--text-display:32px` and `--text-h1:28px` are
not a reason to add more exceptional sizes; **do not globally replace legacy
tokens** as part of an unrelated change. When updating an individual screen,
migrate the affected typography to the approved scale. Prefer CSS tokens
over hardcoded font-size values. Use regular 400, medium 500, semibold 600,
or bold 700 unless existing semantic hierarchy requires 800. No forced
uppercase for normal labels, filter headings or program tags.

### Training → Recommendations & Catalog (binding design contract)

- Upper navigation labels (“Рекомендации”, “Каталог”, etc.): **10px (XXS)**.
- Search text: **14px (S)**; “Создать” and sorting choices: **12px (XS)**.
- Recommendations empty state: “Пока пусто” **16px (M)**;
  explanatory copy **12px (XS)**.
- Catalog program name: **14px (S)**; tags inside program cards **10px
  (XXS)**, including training place and duration.
- Catalog empty-state explanatory copy: **10px (XXS)**.
- Filter headings “Место”, “Направление”, “Уровень”:
  **14px (S)**, **normal case** (not uppercase), no decorative letter spacing.
- Filter choices (“Все”, “Силовой”, etc.): **12px (XS)**.
- “Сбросить фильтры”: **12px (XS)**.
- Implementation is scoped in `src/training-catalog-standards.css`,
  imported **after** the legacy design layers in `src/main.jsx`.
  Do not undo these rules by writing conflicting declarations elsewhere.

### Training → Exercises (Base / My) — binding design contract

- Exactly **one upper Training tab** named “Упражнения”; **no separate “Мои упражнения” top tab**. Keep the Base/My split *inside* Exercises as a two-way text switcher: **“База” / “Мои упражнения”**.
- Search precedes a **single horizontal row** containing two compact filters (“Группа мышц”, “Оборудование”) and the **same compact “+ Создать” button** used by Training program creation. Both filter **selected values are 12px**; preserve one-row layout down to narrow mobile screens.
- Exercise list rows have **no chevron/arrow**; the **info icon is transparent** with no colored background. Tapping either the row or info opens a **full-screen exercise details page**, not a modal sheet.
- Full-screen details typography: “Упражнение” **16px**, sentence case; exercise name **14px**; muscle/equipment tags **12px**; “Описание” **16px**; description body **14px**.
- “Создать” opens a **separate full-screen editor**; top page title **20px**, field labels **16px**, action buttons “Отмена” / “Создать” **14px**. Hide the duplicate “Новое упражнение” heading and required-fields note entirely on this full-screen page; preserve required asterisks on inputs. Video separator “или” stays **10px**. Preserve photo/video inputs and edit/delete safety checks.
- The Base/My text switch has compact top spacing, with its active underline close to the text. Details place a video/animated GIF before the description, or show an outlined “Видео пока нет” placeholder when no media exists. Description starts at five lines and expands/collapses with “Подробнее” / “Скрыть”; additional technique sections remain accessible when expanded.
- The full-screen creation/editing form has **no enclosing box**: its `<form>` uses `display: contents` so inputs are direct items of the page layout, while retaining native submit/validation behavior. Do not replace this with a merely transparent card.
- Edit and delete remain available on the details page **for user-owned exercises only**; removal must check usage in training history and saved programs, preserving referenced data.
- Implementation: `src/components/TrainingExerciseBrowser.jsx`, `src/training-exercise-browser.css`; old `ExerciseLibraryPicker` stays available for workout/program exercise selection and **must not regress**.
- Regression test: `tests/training-exercise-browser.mjs`.

- Training → My Programs: the “Активные / Мои” switch uses the same spacing and active underline offsets as the “База / Мои упражнения” switch. Keep 12px column gap and list spacing, 32px minimum tab height, 4px bottom padding and 3px underline inset; the Create toolbar supplies the vertical space above.

### Shared exercise information and home carousel

- Home ad images slide horizontally as a continuous full-width track, with cloned end frames to avoid a reverse jump during wraparound. The pagination's active capsule animates across fixed-width dot slots; autoplay and touch swipes retain their behavior. Honour reduced-motion settings; no arrow buttons.
- An **active** workout exercise card does not render a prescription summary (e.g. “3×8, отдых 120 сек”). Do not remove prescribed reps from planned workout previews or stored set targets.
- The exercise info page opened from an active workout **reuses ExerciseDetailsContent** from Training → Exercises. Same title hierarchy, photo/video/GIF or outlined no-video block, tags, five-line description and “Подробнее / Скрыть”; same header styling. Keep the workout-native scrolling and rest-timer dock, and restore scroll position when closing it.

### Completed workout results

- The completed workout **tonnage** totals recorded kilograms × repetitions for completed **working** weight/reps sets in both legacy columns and V2 `resultV2` payloads. Do not infer body mass or multiply per-implement weights without an explicit separate metric. Exclude warmups and non-weight/reps activities. Use the same total for the on-screen card and share text.
- The completed workout screen has **no “Результаты по типам нагрузки” section**. Its unified result list uses **every exercise actually stored in the finished session**, including ones added mid-workout (session-only or program scope). Show completed sets first (weight/reps, V2 bodyweight/duration/cardio). If saved weight/reps or valid V2 metrics exist in a not-yet-checked set, show the saved values with “(не отмечен)” instead of a misleading “—”, without marking that set completed, including it in tonnage, or awarding records. A truly empty or merely prefilled planned set still shows “—”. Only external weight/reps completed working sets contribute to tonnage. Keep result editing and underlying data intact; never compare V2 records as legacy e1RM records.
- Regression test: `tests/completed-workout-tonnage.mjs`.

### Bottom navigation — binding design contract

- Order: **Главная → Тренировки → Статистика → Питание → Спортпит**.
- All five buttons use identical icon/label sizing and active-state rules.
  **No raised home icon or circular border.**
- Active highlight: an inset **radial gradient**, stronger in the center,
  gradually fading to transparent at the edges; it **must not touch the edges**
  of the shared bottom navigation panel.
- The CSS source is `src/november-card-navigation-refinements.css`.
  Do not replace the gradient with a solid active-item background.

## Layout and interaction baseline

- Mobile canvas max width **430px**, horizontal inset **18px**
  (adapt at narrow widths); spacing increments **4/8/12/16/20/24/32px**.
- Standard card rounding **24px**, controls **16px**, compact rounding **12px**.
  Use existing `--space-*`, `--radius-*`, `--card-pad` tokens.
- When text can be long: `min-width:0`, wrapping or deliberate line clamp,
  and clearance for adjoining action icons. Do not hide meaningful text by
  layering an overlay on top.
- Preserve product flows, user data, persistence, screen/scroll state,
  and existing mobile interactions. Make the smallest scoped change.
- Inspect the actual React components and **CSS load order** before changing
  behavior or typography. Prefer targeted selectors rather than global
  overrides that change unrelated screens.
- Keep UI checks current. Run CI tests + build, and verify GitHub Pages
  deployment before claiming the update is published. Adjust tests when
  design contracts intentionally change; never delete useful coverage
  merely to make CI green.

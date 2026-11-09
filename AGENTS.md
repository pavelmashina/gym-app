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
- Search precedes a **single horizontal row** containing two compact filters (“Группа мышц”, “Оборудование”) and the **same compact “+ Создать” button** used by Training program creation. Both filter **selected values are 10px**; preserve one-row layout down to narrow mobile screens.
- Exercise list rows have **no chevron/arrow**; the **info icon is transparent** with no colored background. Tapping either the row or info opens a **full-screen exercise details page**, not a modal sheet.
- Full-screen details typography: “Упражнение” **16px**, sentence case; exercise name **14px**; muscle/equipment tags **12px**; “Описание” **16px**; description body **14px**.
- “Создать” opens a **separate full-screen editor**; no “Мои упражнения” eyebrow, required-fields note **12px**, video separator “или” **10px**. Preserve photo/video inputs and edit/delete safety checks.
- Edit and delete remain available on the details page **for user-owned exercises only**; removal must check usage in training history and saved programs, preserving referenced data.
- Implementation: `src/components/TrainingExerciseBrowser.jsx`, `src/training-exercise-browser.css`; old `ExerciseLibraryPicker` stays available for workout/program exercise selection and **must not regress**.
- Regression test: `tests/training-exercise-browser.mjs`.

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

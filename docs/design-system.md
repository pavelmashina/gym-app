# Gym App design system

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

# Feature: Mobile-first design system and visual layer for the web app

## Objective
Give `apps/web` a real visual layer: a mobile-first design system built from the Inca Rail identity found in the Figma cover, applied to every shipped screen, keeping tier theming, accessibility, offline/PWA behavior and all existing tests and E2E scenarios.

## Why
The user opened the app and saw unstyled HTML: there is no CSS at all (0 css files, 0 classNames, no styling library); only provisional per-tier color tokens exist in `src/shared/theme` and nothing consumes them.

## Brand source (Figma `Design-System`, file key o9Omx5tJTmmBMbl8XqgIT3, only a "Cover" page exists; the design system itself is "In progress": no components, no variables)
- Brand green `#053220`, cream `#f9f7f0`, accent orange-red `#ff3c1d`.
- Headings: Playfair Display SemiBold; UI: Inter (SemiBold for emphasis).
- Logo: `INCARAIL` wordmark SVG (cream `#F9F7F0` fill, 247x51), downloaded to the scratchpad `logo-incarail.svg`.
- Decisions approved by the user: follow this identity and design the rest from it; fonts self-hosted (offline PWA); tokens must absorb a later, fuller Figma.

## Scope / constraints
- Plain CSS (CSS custom properties + the existing `ThemeProvider` variables), no Tailwind/CSS-in-JS; the only new dependencies allowed are self-hosted font packages (`@fontsource-variable/inter`, `@fontsource-variable/playfair-display`) or equivalent woff2 files committed with their OFL licenses.
- Mobile-first (baseline 360-390px), touch targets >= 44px, visible focus, WCAG AA contrast (verify numerically), `prefers-reduced-motion`, safe-area insets, bottom tab navigation, adapts to wide screens (centered column).
- Tier theming stays token-driven (no tier branches in components): brand base shared, tier supplies the accent; FIRST_CLASS keeps its dark surface.
- Existing behavior untouched: no changes to data flow, routes, i18n keys' meaning, accessible names/roles that E2E locators rely on. Strict TDD only where behavior/logic changes (token resolution, theme provider); CSS itself is verified by screenshots + a11y checks.
- No Co-Authored-By/AI attribution in commits; agent must not push or touch PRs; no TLS weakening, no sudo.
- CSP is `default-src 'self'`, `style-src 'self' https: 'unsafe-inline'`, `font-src 'self' https: data:`: assets must be same-origin.
- Route: delegated direct, writers in sequence (phase A foundation + trip core, phase B the rest).

## Tasks
- [x] A1 Foundation: brand tokens (replace the provisional tier palette with brand base + per-tier accent; keep `ThemeTokens` shape or extend additively; update tests), fonts, global/reset CSS, typography scale, spacing/radius/shadow tokens, logo asset + app shell (header with logo, bottom tab nav, language switcher styled), PWA `theme_color`/`background_color`/`index.html` theme-color, shared UI primitives (button, card, badge/chip, list, alert, skeleton/spinner, form controls).
- [x] A2 Trip core screens: home, itinerary (boarding pass), documents; loading/error/offline states.
- [ ] B1 Help, menu, destination.
- [ ] B2 WiFi (catalog, checkout return), push opt-in, pulse prompt, consent gates (precheckin/push/pulse), pre check-in flow (capture, fallback, status).
- [ ] B3 Cross-cutting QA: screenshots of every screen at 390x844 and 768 for es/en/pt and for each tier theme + FIRST_CLASS dark; contrast check; keyboard focus order; fix findings; E2E 20 passed; turbo green.

## Design decisions (phase A)
- CSS approach: ONE plain global stylesheet tree in `apps/web/src/styles/` (`fonts`, `tokens`, `base`, `layout`, `components`, `trip`, aggregated by `index.css`, imported once from `main.tsx`), BEM-style classes, no CSS Modules. Components carry class names only (no CSS imports), so Vitest (`css: false`) is unaffected.
- Tokens: brand/scale tokens (type, space 4px base, radius, shadow, z-index, motion, safe-area, tap target) are static in `styles/tokens.css`; the per-tier COLORS are `ThemeTokens` -> `--th-color-*` injected by `ThemeProvider` (single source `shared/theme/tokens.ts`). `ThemeTokens` extended additively: surface, textMuted, border, onPrimary, onAccent. The app shell wraps everything in a neutral `ThemeProvider`; trip screens nest their tier provider (class `theme-root` paints bg/text).
- Tier strategy: shared brand light base (cream bg, white surface); each tier supplies only primary (ink/hero fill), secondary (dark variant), accent (soft tint for badges) + their on-colors. FIRST_CLASS: dark surface + gold. Unresolved/UNKNOWN = brand neutral (Inca Rail green). Brand orange-red `#ff3c1d` is only used decoratively/focus ring; filled actions use the accessible `--brand-action` `#c42a0f` (white text 5.7:1) because `#ff3c1d` with white text is only 3.55:1.
- Fonts: `@fontsource-variable/inter` + `playfair-display` (OFL), only latin + latin-ext `@font-face` declared in `fonts.css` (full package CSS would ship every script). Latin precached by the service worker (`globPatterns` += woff2,svg; latin-ext excluded from precache, ~106 KB saved).
- Nav: trip core screens (home/itinerary/documents) use `TripTabBar` (sticky bottom, `aria-current`, optional pre check-in tab gated by `isPrecheckinOffered`) instead of the per-page link rows. Phase B screens still have their plain `<nav>` rows (styled as pill links by a fallback rule).
- Markup changes beyond classes (intentional): tab bar replaces in-page `<nav>`; passengers + tier badge on home; boarding pass seat/coach/barcode + arrival time on itinerary (new i18n keys `trip.passengers`, `itinerary.{boardingPass,departs,arrives,seat,coach}` in es/en/pt); ticket cards/`Alert` wrappers; `itinerary-page` test changed `getByText("Itinerary")` -> heading role because the tab label adds a second "Itinerary" text. Language buttons render the locale code visibly with the full language name visually hidden (accessible names unchanged).

## Contrast table (WCAG AA, normal text 4.5:1; enforced by `shared/theme/tokens.test.ts`)
| Theme | text/bg | text/surface | muted/bg | muted/surface | primary/bg | primary/surface | onPrimary/primary | onPrimary/secondary | onAccent/accent |
|---|---|---|---|---|---|---|---|---|---|
| NEUTRAL (UNKNOWN) | 15.23 | 16.33 | 5.90 | 6.33 | 13.21 | 14.16 | 13.21 | 9.60 | 8.88 |
| VOYAGER | 15.23 | 16.33 | 5.90 | 6.33 | 6.35 | 6.81 | 6.81 | 9.78 | 9.42 |
| VISTADOME_360 | 15.23 | 16.33 | 5.90 | 6.33 | 5.85 | 6.27 | 6.27 | 9.25 | 9.44 |
| PRIME | 15.23 | 16.33 | 5.90 | 6.33 | 8.23 | 8.82 | 8.82 | 11.81 | 9.84 |
| FIRST_CLASS (dark) | 16.28 | 14.17 | 9.70 | 8.44 | 9.30 | 8.10 | 9.10 | 6.52 | 9.10 |

Global pairs: cream on header green 13.21; header title `#cfd6cf` on green 9.55; white on `--brand-action` 5.70; alert info 12.01, warning 9.16, error 8.15, success 7.09; inactive tab `#55635a` on white 6.33. Focus ring `#ff3c1d` (non-text, needs 3:1): cream 3.31, white 3.55, header green 3.99, dark bg 5.27, dark surface 4.59. All pass.

## Progress / evidence
- A1 + A2 done (phase A). Commits: fdf4bb8 tokens+fonts+global styles; 69418e1 shell+primitives; see git log for the trip-screens commit and the final docs commit.
- Strict TDD: RED observed first for token/provider tests (15 failed), Button/Alert/LoadingState/TripTabBar (modules missing), banner/boarding-pass/page tests; GREEN after implementation.
- `pnpm --filter web exec vitest run`: 94 files / 407 tests pass; `tsc --noEmit` clean; eslint 0 errors (11 pre-existing react-refresh warnings in route-tree.tsx); `pnpm --filter web build` OK (SW precaches css, latin fonts, logo svg); `turbo run typecheck lint test --filter=bff --filter=contracts --filter=web --filter=e2e` 13/13 successful; full E2E container run: 20 passed (incl. offline boarding pass).
- Visual: Playwright (Docker) screenshots at 390x844, 768x1024, 1280x800 for home/itinerary/documents (PRIME 2 pax, VOYAGER + relocation, simulated VISTADOME_360 and FIRST_CLASS via /api/trip interception), es/en/pt, offline (itinerary + documents), loading, error, keyboard focus order. Fixes after looking: boarding-pass route wrapped awkwardly -> vertical origin/destination route; hero "Departs/Arrives" labels low contrast -> inherit on-primary; skeleton gradient too harsh -> color-mix tint.
- Keyboard order on /trip: ES, EN, PT, Viagem, Itinerario, Documentos, Pre check-in (logical; focus ring visible on header and tabs).
- Not verified: real devices, Safari/iOS safe-area behavior, Firefox rendering, screen reader pass, color-blind simulation.

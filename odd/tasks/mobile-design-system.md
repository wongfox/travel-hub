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
- [ ] A1 Foundation: brand tokens (replace the provisional tier palette with brand base + per-tier accent; keep `ThemeTokens` shape or extend additively; update tests), fonts, global/reset CSS, typography scale, spacing/radius/shadow tokens, logo asset + app shell (header with logo, bottom tab nav, language switcher styled), PWA `theme_color`/`background_color`/`index.html` theme-color, shared UI primitives (button, card, badge/chip, list, alert, skeleton/spinner, form controls).
- [ ] A2 Trip core screens: home, itinerary (boarding pass), documents; loading/error/offline states.
- [ ] B1 Help, menu, destination.
- [ ] B2 WiFi (catalog, checkout return), push opt-in, pulse prompt, consent gates (precheckin/push/pulse), pre check-in flow (capture, fallback, status).
- [ ] B3 Cross-cutting QA: screenshots of every screen at 390x844 and 768 for es/en/pt and for each tier theme + FIRST_CLASS dark; contrast check; keyboard focus order; fix findings; E2E 20 passed; turbo green.

## Progress / evidence
(none yet)

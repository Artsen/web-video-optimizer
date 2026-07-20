# Brand System

Web Video Optimizer uses a "precision slate with a controlled spectral transformation" direction: calm local tooling, clear media operations, and restrained moments of color where work is selected, processing, or complete.

## Principles

- Slate neutrals carry most of the interface.
- Iris marks primary interaction, selection, and focus.
- Ember appears sparingly as the transformation accent.
- Green is reserved for genuine success.
- Blue, amber, and red stay semantic for information, caution, and failure.
- Dense workspaces stay operational and quiet; empty states may express the brand more strongly.

The intended balance is roughly 80% slate structure, 15% tonal elevation and borders, 4% iris interaction, and 1% ember accent.

## Logo

The mark is a compression-frame symbol: an outer video frame, three narrowing source bands, and a terminal output/play shape. It should suggest media reduction and website-ready delivery without resembling a generic clapperboard or AI sparkle.

Canonical app assets live in `apps/web/src/assets/brand/`. Documentation copies live in `docs/assets/brand/` so GitHub can render README imagery.

Logo variants:

- `mark.svg`: spectral icon mark.
- `mark-monochrome.svg`: one-color app mark.
- `wordmark-dark.svg`: horizontal logo for dark backgrounds.
- `wordmark-light.svg`: horizontal logo for light backgrounds.
- `apps/web/public/favicon.svg`: favicon-compatible mark.

When the mark sits next to visible "Web Video Optimizer" text, it should be `aria-hidden` to avoid duplicate announcements. Use text alternatives for standalone documentation imagery.

Clear space should be at least one quarter of the mark width on all sides. Minimum practical sizes are 16px for the favicon mark, 20px for navigation chrome, 32px for prominent UI placement, and 180px wide for the wordmark.

Do not rotate, stretch, recolor outside the approved palette, add glow effects, place on low-contrast imagery, replace the compression bands, or use the spectral gradient as ordinary text fill.

## Palette

Dark theme:

| Token                      | Value     |
| -------------------------- | --------- |
| `--color-app-bg`           | `#080c12` |
| `--color-sidebar-bg`       | `#090e15` |
| `--color-workspace-bg`     | `#0e151f` |
| `--color-surface`          | `#141d29` |
| `--color-surface-elevated` | `#1a2533` |
| `--color-surface-recessed` | `#0c121b` |
| `--color-surface-hover`    | `#202c3c` |
| `--color-surface-selected` | `#1c2440` |
| `--color-primary`          | `#6a5bcf` |
| `--color-ember`            | `#f2763f` |
| `--color-success`          | `#35c981` |
| `--color-info`             | `#5aa7ff` |
| `--color-warning`          | `#e8b44d` |
| `--color-danger`           | `#f06a72` |

Light theme:

| Token                      | Value     |
| -------------------------- | --------- |
| `--color-app-bg`           | `#f2f4f7` |
| `--color-sidebar-bg`       | `#e9edf2` |
| `--color-workspace-bg`     | `#ffffff` |
| `--color-surface`          | `#ffffff` |
| `--color-surface-elevated` | `#ffffff` |
| `--color-surface-recessed` | `#eef1f5` |
| `--color-surface-hover`    | `#e5eaf0` |
| `--color-surface-selected` | `#eeeafe` |
| `--color-primary`          | `#5848b8` |
| `--color-ember`            | `#b84c1f` |
| `--color-success`          | `#187a4b` |
| `--color-info`             | `#2463c5` |
| `--color-warning`          | `#8b5c00` |
| `--color-danger`           | `#b72c3b` |

## Gradients

The canonical spectral gradient is:

```css
linear-gradient(120deg, #5f6fe5 0%, #765bc8 54%, #e66a3a 100%)
```

Use it for the logo, thin brand accents, active processing progress, empty-state atmosphere, and selected transformation indicators. Do not use it as every button fill, panel border, page background, ordinary label treatment, or semantic status substitute.

Ambient fields may appear behind empty or startup states only. They must stay subtle, static, behind content, and disabled under forced-colors.

## Typography And Shape

The app uses a system stack centered on Segoe UI Variable, Segoe UI, Inter when locally available, system-ui, and sans-serif. Use weight and spacing before adding extra color.

Controls use approximately 8px radius, cards 10px, and dialogs or major empty states 14px. Dark mode relies on tonal elevation and borders more than shadows.

## Interaction And Status

Primary actions are solid iris with white text. Secondary actions use quiet slate surfaces. Selected states use an iris rail or border plus a tonal shift. Processing may use iris-to-ember progress. Completed states use green with text or icon support. Warning, danger, and destructive states stay amber or red and must not be replaced with ember.

Focus uses the iris focus ring and remains visible in dark, light, and forced-colors modes. Do not remove focus outlines.

## Accessibility

Normal text should meet at least 4.5:1 contrast and large text at least 3:1. Status must not rely on color alone. Reduced-motion and forced-colors users should receive simplified, readable treatments. Screenshot review and Playwright accessibility checks are part of the release process.

## Screenshot Examples

Curated README screenshots are stored in `docs/assets/screenshots/`. Full deterministic review captures are generated into `.tmp/ui-review/` by `npm run review:ui-screens` and must not be committed.

The screenshot set should cover dark and light themes, Prepare, Results, Compare, Custom Export, mobile, startup failure, degraded startup, processing, completed, warning, and selected-output states.

# CircuitTecture Design System & UI Architecture

## Aesthetic Vision
CircuitTecture uses a **Hardware/Maker Dev-Tool Aesthetic** — precision typography, high-contrast dark/light mode parity, PCB-inspired accents (solder green, copper amber, silk-screen white/cyan), crisp structural borders, and dense, scannable layouts.

---

## 1. Design Tokens (`:root` & `[data-theme]`)

### Color Palette

#### Dark Theme (`[data-theme="dark"]` / Default)
- `--bg`: `#060b13` (Deep PCB Core)
- `--bg2`: `#0b1324` (Sub-board Surface)
- `--bg3`: `#111c36` (Component Card Fill)
- `--panel`: `#0d172e` (Sidebar & Floating Panels)
- `--panel2`: `#091022` (Embedded Inset Traces)
- `--line`: `#1e2d4d` (Subtle Trace Line)
- `--line2`: `#2d406a` (Active Structural Border)
- `--ink`: `#eef4ff` (Primary Silk-screen Text)
- `--ink2`: `#94a3b8` (Secondary Label Ink)
- `--ink3`: `#64748b` (Muted Helper Text)
- `--acc`: `#22c55e` (Solder Green / Primary Accent)
- `--acc2`: `#06b6d4` (Copper Cyan / Secondary Accent)
- `--warn`: `#f59e0b` (Caution Amber)
- `--err`: `#ef4444` (Short Circuit / Danger Red)
- `--vio`: `#a855f7` (Logic Trace Violet)

#### Light Theme (`[data-theme="light"]`)
- `--bg`: `#f8fafc` (Silkscreen Off-white)
- `--bg2`: `#ffffff` (Clean Panel White)
- `--bg3`: `#f1f5f9` (Sub-panel Fill)
- `--panel`: `#ffffff` (Floating Surfaces)
- `--panel2`: `#e2e8f0` (Inset Traces)
- `--line`: `#cbd5e1` (Light Trace Border)
- `--line2`: `#94a3b8` (Strong Border)
- `--ink`: `#0f172a` (Primary Text Ink)
- `--ink2`: `#475569` (Secondary Label Ink)
- `--ink3`: `#64748b` (Muted Helper Text)
- `--acc`: `#16a34a` (Solder Green Accent)
- `--acc2`: `#0891b2` (Cyan Accent)

---

## 2. Spacing Scale

Strict 4px/8px grid system for layout hierarchy and component density:
- `--space-1`: `4px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-6`: `24px`
- `--space-8`: `32px`
- `--space-12`: `48px`

---

## 3. Typography Scale

- `--font-mono`: `'JetBrains Mono', 'SFMono-Regular', Consolas, monospace`
- `--font-sans`: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

| Token | Size | Line Height | Usage |
| --- | --- | --- | --- |
| `--type-xs` | `11px` | `1.3` | Micro labels, pin numbers |
| `--type-sm` | `13px` | `1.4` | Code editor, table cells, form labels |
| `--type-base` | `15px` | `1.5` | Body text, card descriptions |
| `--type-lg` | `18px` | `1.4` | Section headers, panel titles |
| `--type-xl` | `24px` | `1.3` | Modal titles, dashboard headers |
| `--type-2xl` | `36px` | `1.2` | Page titles |
| `--type-hero` | `56px` | `1.05` | Landing page hero headline |

---

## 4. Component Affordances & Patterns

### Buttons & Interactive Controls
- **Primary CTA (`.btn-primary`)**: Solid Solder Green (`#22c55e`), dark bold text (`#052e16`), crisp 6px border-radius, high-contrast focus ring.
- **Secondary CTA (`.btn-secondary`)**: PCB Cyan stroke/fill (`#06b6d4`), subtle hover glow.
- **Ghost/Subtle (`.btn-ghost`)**: Transparent background, border on hover.
- **Danger (`.btn-danger`)**: Solid Red (`#ef4444`) with explicit confirmation dialogs for destructive actions.
- **Touch Target**: All interactive controls maintain a minimum 44×44px hit area on mobile viewports (`@media (max-width: 768px)`).

### Progressive Disclosure in Editor
- Editor panels (Pinout, DRC, Logic Analyzer) default to collapsible/tabbed states, keeping the central canvas (`800×600` default) visually dominant.

### Semantic Color Coding
- **Green (`--acc`)**: Normal operation, valid wire connection, active simulation.
- **Amber (`--warn`)**: Floating pin, strapping pin caution, non-critical DRC warning.
- **Red (`--err`)**: Short circuit, power/ground direct short, failed backup restore.

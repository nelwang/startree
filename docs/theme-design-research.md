# Theme design research

Research date: 2026-10-06.

## Recommendation

Keep Startree's quiet, compact interface and forest-green identity. Offer a small set of coordinated palettes, each with light and dark appearances. Separate palette choice from appearance (`System`, `Light`, `Dark`) so the owner can keep a favorite color while following the operating system. Put the controls in the shared app bar so they remain available on every Page.

This is a design recommendation, not a claim that one palette suits everyone. Forest is the natural default; Ocean offers a cool blue alternative; Rose offers a warmer alternative. Prefer softly tinted surfaces, clear text, restrained selected states, and brighter accents against dark backgrounds.

Suggested starting colors, to be validated against the actual rendered UI:

| Role           | Forest light | Forest dark |
| -------------- | ------------ | ----------- |
| Canvas         | `#f7f8f4`    | `#17211c`   |
| Raised surface | `#ffffff`    | `#203128`   |
| Primary text   | `#24382f`    | `#e5eee7`   |
| Secondary text | `#5f7165`    | `#a1b4a7`   |
| Accent         | `#34684e`    | `#9ad4b0`   |

Possible alternate accent/surface pairs are Ocean `#315f99` / white and `#a2c6ff` / `#1b283d`, and Rose `#93475f` / white and `#efabc0` / `#33222b`. These are starting points; the complete palette must also define selected, hover, danger, focus, input, and overlay colors.

Calculated with the WCAG relative-luminance formula, the proposed Forest text/canvas pairs have contrast ratios of 11.71:1 and 13.94:1; secondary text/canvas pairs are 4.88:1 and 7.56:1. Accent/raised-surface ratios are 6.49:1 and 8.11:1. These calculations validate the listed pairs only, not whole-application accessibility. [WCAG contrast definition](https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)

## Requirements supported by primary sources

- Normal text needs at least 4.5:1 contrast, large text 3:1, and visual information needed to identify controls or states 3:1 against adjacent colors. Do not assume that an attractive-looking muted gray is readable. [WCAG text contrast](https://www.w3.org/TR/WCAG22/#contrast-minimum), [non-text contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)
- Theme options need names and an explicit selected state; color alone cannot convey meaning. Use native controls where practical and preserve visible keyboard focus. [WCAG use of color](https://www.w3.org/TR/WCAG22/#use-of-color), [focus visible](https://www.w3.org/TR/WCAG22/#focus-visible)
- `prefers-color-scheme` exposes a light/dark preference. Use it for System appearance and react to preference changes while System is active. An explicit choice should take precedence; that precedence is this app's recommended behavior. [CSS Media Queries Level 5](https://drafts.csswg.org/mediaqueries-5/#prefers-color-scheme)
- Set the root `color-scheme` to the resolved appearance so browser-rendered controls and scrollbars agree with custom surfaces. Custom CSS colors still need explicit theme tokens. An early color-scheme declaration helps the browser choose the initial canvas before all styling loads. [CSS Color Adjustment](https://drafts.csswg.org/css-color-adjust/#color-scheme-prop), [color-scheme metadata](https://drafts.csswg.org/css-color-adjust/#color-scheme-meta)
- Persist the owner's choice locally, validate stored values, and catch storage access/write failures. Storage may be denied and writes can fail; switching should continue for the current session. Listen for storage changes to keep open tabs consistent. [HTML Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html#the-localstorage-attribute), [storage operations and broadcast](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface)

## Application implications

The existing shared stylesheet and Notes stylesheet contain many literal light colors. Replace these with semantic CSS variables shared across Pages, including dialogs, inputs, tags, empty states, warning messages, and toolbar controls. Changing only the page background would leave substantial areas in the wrong appearance. Keep the preference module independent of Bookmark and Notes data, and apply the stored preference early enough to avoid flashing the opposite appearance during startup.

Verify every palette in both appearances, System changes, persistence after reload, unavailable storage, keyboard operation, and a narrow viewport. Inspect Bookmarks, Notes, and editor dialogs; check meaningful foreground/background pairs rather than only token definitions.

## Implemented scope

The implementation ships Forest, Ocean, Dune, and Dusk palettes, each with independent System, Light, and Dark appearances. The final set favors three distinct alternatives to green: blue, terracotta, and muted purple. The final colors are centralized in `src/client/app/theme.css`: light canvas `#f5f6f0`, surface `#ffffff`, text `#24352c`, muted text `#59695f`, accent `#316548`; dark canvas `#141c19`, surface `#1c2822`, text `#e4eee7`, muted text `#a9bbb0`, accent `#95d5ac`. These refined values supersede the starting proposal above.

Tokens use `light-dark()` with the root `color-scheme`; System follows the browser automatically, while explicit appearances override it. This targets modern browsers supporting `light-dark()` (Baseline 2024). [MDN light-dark() reference](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark)

A small same-origin script reads the local preference before styles load, compatible with the existing Content Security Policy. The sticky app bar keeps the appearance control available while scrolling. Appearance and palette preferences are device-local, survive reload, and synchronize independently between open tabs. The browser toolbar color follows the selected palette and appearance.

Validation: `npm run check`, `npm test`, `npm run build`, and `node scripts/theme-acceptance.mjs` after building. The browser acceptance script checks system changes, explicit overrides, persistence, cross-tab synchronization, blocked storage, narrow viewports, and text contrast in Bookmarks, the Bookmark editor, and Notes setup.

## Additional palettes

| Palette | Character                                                     | Light canvas / accent | Dark canvas / accent  |
| ------- | ------------------------------------------------------------- | --------------------- | --------------------- |
| Ocean   | Cool mist, slate blue, and deep navy; quiet and precise       | `#f3f5f9` / `#365e98` | `#171d29` / `#a6c5fa` |
| Dune    | Warm paper, sand, and terracotta; tactile and relaxed         | `#f8f4ed` / `#995034` | `#221c19` / `#e8b094` |
| Dusk    | Soft chalk, muted plum, and lilac; restrained and atmospheric | `#f7f4f9` / `#79528f` | `#211b27` / `#d3b2e9` |

Each palette defines text, muted text, surfaces, sidebar, hover, selected backgrounds, borders, focus/accent, and filled controls. Shared amber warnings and red destructive actions retain their meaning across palettes. Saturation is concentrated in small accents; large surfaces remain softly tinted. These are original design choices, not externally prescribed palettes.

The shared app bar exposes one native Theme select with a live accent swatch. Options are grouped by palette and select a complete combination, such as Ocean · Dark or Dune · System. Previously saved palette and appearance preferences remain compatible. On narrow screens, Page navigation occupies a second row. Browser acceptance covers all eight palette/appearance combinations in Bookmarks, the Bookmark editor, and Notes setup, plus preference persistence, cross-tab independence, storage failure, and narrow-screen control placement.

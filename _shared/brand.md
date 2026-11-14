# Brand

**Scope (Steve, Sat 14 Nov):** these Space Apps rules apply to Space Apps material: logos, the submission page, slides and video. **The app itself doesn't need Space Apps colours**: give it its own clean, good-looking design (still 4.5:1 contrast, keyboard-usable, works on a phone). If the Space Apps logo appears in the app, the logo rules below still apply.

**Diagrams (Steve, Sat 14 Nov):** Mermaid diagrams are fine on the "how we built it" page (`web/how.html`), which sits outside the main app. In the app itself, pictures are NASA photographs or charts computed from our data; still no generated images, video or audio anywhere.

Space Apps brand rules, from https://www.spaceappschallenge.org/brand/ and the Brand Guide PDF (https://assets.spaceappschallenge.org/media/documents/Space_Apps_Brand_Guide_VUGpVJm.pdf).

## Logos
- Use only the **NASA Space Apps** logo, from the official pack: https://assets.spaceappschallenge.org/media/documents/NASA_Space_Apps_Logos_2026.zip . Copy the file you use into `web/public/brand/` unchanged.
- **Never use NASA's own branding** (the meatball or the worm).
- On Deep Blue or Electric Blue: `Space Apps Logo Color and White.svg`. On white: `Space Apps Logo Color and Black.svg`. Tight spots: the small or motif versions.
- Don't tilt, rotate, skew, stretch, recolour, rearrange, outline, or put it on busy imagery.
- Our team logo may sit alongside it, never in its place.

## Colours
| Name | Hex | Use |
|---|---|---|
| Blue Yonder | `#2E96F5` | |
| Neon Blue | `#0960E1` | |
| Electric Blue | `#0042A6` | background OK; gradient start |
| Deep Blue | `#07173F` | background OK; gradient end |
| Rocket Red | `#E43700` | accent only, **never a background** |
| Martian Red | `#8E1100` | |
| Neon Yellow | `#EAFE07` | sparing accent for text, buttons, symbols; **never a background** |
| White | `#FFFFFF` | background OK |

- Body text only on Deep Blue, Electric Blue or White, at **4.5:1** contrast or better.
- Optional background: linear gradient at 45°, Electric Blue top-left to Deep Blue bottom-right.

## Fonts (Google Fonts)
- Headings: **Fira Sans** Black/Bold, or Overpass Bold
- Body: **Overpass** Regular/Bold/Italic

## Icons and patterns
- Icons: Phosphor or Feather style, only where the meaning is unambiguous; otherwise text labels.
- Patterns pack: https://assets.spaceappschallenge.org/media/documents/Space_Apps_Patterns.zip (Orbits or Rosette, ~25% opacity over a blue).

## CSS tokens
```css
:root {
  --sa-blue-yonder: #2e96f5;
  --sa-neon-blue: #0960e1;
  --sa-electric-blue: #0042a6;
  --sa-deep-blue: #07173f;
  --sa-rocket-red: #e43700;
  --sa-martian-red: #8e1100;
  --sa-neon-yellow: #eafe07;
  --sa-white: #ffffff;
  --sa-gradient: linear-gradient(135deg, #0042a6 0%, #07173f 100%);
  --sa-font-heading: 'Fira Sans', 'Overpass', sans-serif;
  --sa-font-body: 'Overpass', sans-serif;
}
```

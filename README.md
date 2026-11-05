# ajwoo photo

A simple, local-first photo editor for people and AI agents — https://photo.ajwoo.com

Edit one photo at a time on a phone or a desktop. Every edit is a recipe re-rendered from the original
file, which is never changed and never uploaded. Agents use `window.ajwooPhoto` in the page; see
[public/llms.txt](public/llms.txt). The product plan is in [docs/PLAN.md](docs/PLAN.md).

## Prototype 0.1

- Open JPEG, PNG, WebP, AVIF, GIF (first frame), BMP; HEIC and TIFF where the browser decodes them (Safari).
- Light, Color, tone curve (RGB + channels), color mixer (8 bands), color grading, clarity, sharpening, vignette, Auto.
- Up to 4 masks: linear gradient, radial gradient, brush — each with its own exposure, contrast, highlights,
  shadows, temperature, tint, saturation, clarity. Invert, amount, overlay.
- Crop with aspect ratios, rotate, flip. Compare (tap or hold, `\`). Undo/redo. Autosave in the browser.
- Export JPEG / PNG / WebP up to 16.7 MP; metadata including location is not written.
- WebGL2 renderer: one fixed-order shader for preview and export.

Not yet: Select subject/sky, healing/removal, noise reduction, RAW, PDF, zoom to 100%.

## Develop

```bash
npm install
npm run dev     # http://127.0.0.1:5180
npm test
npm run build
```

Pushing to `main` deploys to GitHub Pages (custom domain in `public/CNAME`).

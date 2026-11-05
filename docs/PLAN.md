# Photo editor for people and AI agents — revised product plan

**Status:** proposal for review; no implementation authorized by this document.  
**Revised:** November 5, 2026.  
**Scope:** one photo at a time, a web interface that works well on both phones and desktops, a minimal and simple UI, local processing by default, and a first-class agent interface.  
**Reading guide:** sections 1–4 cover the product and UX; 5–9 define capabilities and architecture; 10–12 cover delivery, validation, and decisions. Appendix A records what changed from the first draft.

## 1. Recommendation

Build a **single-photo editing workspace where a person and an agent can take turns making precise, reversible edits to the same project**. The photo remains central; masks, adjustments, and retouches remain inspectable and editable. An agent should accomplish a useful edit through a few structured calls, and a person should be able to continue from exactly that state using familiar controls.

The first useful release should demonstrate this complete loop:

> Open a photo → correct its overall tone and color → select and improve a subject or sky → refine the selection → compare → export a finished image and save an editable project.

Borrow Lightroom's photographic controls and mask workflow, Figma's selection-to-inspector relationship and command search, and CapCut's direct actions and focused mobile controls. Develop an original interface around that combination.

**Keep the ambition; narrow each release.** Basic masks and real agent connectivity belong in the first useful beta. Extensive RAW support, advanced restoration, and complex generative removal need separate quality gates. Do not present a broad format list or an AI model name as proof that a professional workflow works.

### The job and priorities

| Priority | Goal | Observable result |
| --- | --- | --- |
| 1 | Finish a good edit quickly | A person or agent reaches a visually acceptable export with few corrections. |
| 2 | Keep work recoverable | Original bytes survive unchanged; edits can be undone, reopened, and moved to another browser. |
| 3 | Make precision understandable | It is always clear which region is being edited and what each control changes. |
| 4 | Make automation efficient | Stable tools, compact results, batched edits, useful previews, and safe retries. |
| 5 | Keep ordinary editing local | Core editing does not require an account, API key, or photo upload. |
| 6 | Feel simple on any screen | A person can edit comfortably on a phone or a desktop, with a minimal interface that shows only what the current task needs. |

Here, **local adjustment** means editing a region of the photo; **on-device processing** means keeping computation on the user's device. These are separate promises.

## 2. Product boundaries and primary workflows

### In scope

- One active source photo, with named versions of its edit.
- Global tone and color, regional adjustments, precision masking, geometry, detail, and retouching.
- Original-preserving projects, high-quality rendered exports, and explicit format limitations.
- A GUI, a typed editing interface, and one supported external-agent connection.
- Mobile- and desktop-friendly for people: one responsive web app with the same tools, names, and edit model on both. Phone layouts use touch-sized controls and one focused control at a time; desktop layouts use the extra room for the photo and a single inspector.

### Later

Photo catalogs, ratings, batch processing, cloud sync, multiplayer collaboration, video timelines, text/sticker composition, panorama/HDR merging, print production, and broad XMP interoperability. A small Recent projects list is useful for recovery and does not require a Lightroom-style library.

### A. A person edits a portrait

1. Drop a photo or choose **Open photo**. Show the image as soon as a preview is available; identify preview-only decoding when relevant.
2. Adjust exposure, white balance, and contrast in **Edit**. Numeric entry and reset are visible.
3. Choose **Mask → Subject**, inspect the overlay, subtract an unwanted region with the brush, and raise subject exposure.
4. Choose **Retouch → Heal**, tap a blemish, and adjust the source if the automatic sample is poor.
5. Compare at Fit and 100%; export a JPEG and optionally save the editable project.

### B. An agent edits a landscape

1. Open the supplied source and receive its revision, capabilities, and a compact preview.
2. Request a sky mask and targeted analysis. Avoid running every detector automatically.
3. Commit one labeled batch containing global tone changes and sky adjustments.
4. Inspect a before/after preview and a boundary crop; correct the mask if needed.
5. Export a specific revision. Return an export receipt and the project handle.

### C. A person takes over an agent edit

The activity entry reads, for example, **Agent · Brighten subject — 4 adjustments, 1 mask**. Selecting it reveals the changes and comparison. The person can continue with normal sliders, undo the latest batch, or restore a named version. Earlier agent work must not be removed by blindly undoing subsequent human changes.

### D. The user returns after a reload

Reopen the most recent committed project, including mask assets and the chosen version. Restore the useful view state separately. If the source or an asset is missing, explain what is missing and offer reattachment or project import; never silently render an incomplete recipe as the finished edit.

## 3. UX inspiration and layout

### Reference patterns and proposed adaptations

| Reference | Documented pattern to study | Proposed adaptation |
| --- | --- | --- |
| [Lightroom Classic masking](https://helpx.adobe.com/lightroom-classic/desktop/process-and-develop-photos/masking.html) | Subject, sky, and background selections; manual masks; refinement and combinations. | Named masks with visible components and the same local controls for a person or agent. |
| [Lightroom tone and color](https://helpx.adobe.com/lightroom-classic/help/image-tone-color.html) | Photographic adjustment groups, curves, and histogram-guided editing. | A familiar inspector with precise values and a clear distinction between Whole photo and a selected mask. |
| [Figma properties panel](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar) | The selected object determines the properties shown on the right. | Selecting a mask, patch, or crop changes one inspector; a persistent scope label prevents accidental edits. |
| [Figma Actions](https://help.figma.com/hc/en-us/articles/23570416033943-Use-the-actions-menu-in-Figma-Design) | Searchable actions, accessible with Cmd/Ctrl+K. | Search commands and controls, show shortcuts, and offer typed values without opening several panels. |
| [CapCut mobile photo editing](https://www.capcut.com/resource/ai-image-enhancers-free) | Bottom tools lead to Adjust controls, preview, and export. | A mobile category bar and one precise active control at a time. |

### Specific patterns worth borrowing

The table above names the sources; this list is the concrete material to prototype and test against. Each item lists the reference it comes from.

| Pattern | From | Use here | Milestone |
| --- | --- | --- | --- |
| Double-click a slider label to reset it | Lightroom | Every slider; also a visible reset in the value field for touch | 1 |
| Hold Alt/Option while dragging Exposure, Whites, or Blacks to show clipping | Lightroom | Clipping overlay; also a visible histogram-corner toggle so the feature is not hidden behind a key | 1 |
| Targeted adjustment: drag on the photo to move the curve point or HSL band under the pointer | Lightroom | Curves and Color mixer pickers; agents get the equivalent through `analyze` on a region | 2 |
| Before/after split, side-by-side, and toggle | Lightroom | Compare menu with one default (toggle) and two optional views | 1 |
| Mask overlay colour toggle and per-mask visibility | Lightroom | `O` and an eye icon on each mask row | 2 |
| Heal circles showing source and target, with a draggable source | Lightroom | Heal and Clone | 2 |
| Scrubby number fields: drag the label to scrub, click to type, arithmetic such as `+10` or `*2` | Figma | Every numeric field; arithmetic is resolved and echoed as an absolute value | 1 |
| Selected object drives one properties panel | Figma | Mask / retouch / crop selection swaps the inspector; the scope label always shows what is being edited | 1 |
| Boolean vocabulary: union, subtract, intersect | Figma | Mask components: Add, Subtract, Intersect | 2 |
| Named versions in version history | Figma | Named versions, restore as a new revision | 1 |
| Search-everything action menu | Figma | Command search over controls, actions, and typed values | 2 |
| One-tap AI actions shown as plain buttons | CapCut | **Auto**, **Select subject**, **Select sky** as direct buttons, each producing a normal, editable result | 2 |
| One category bar, then one full-width slider | CapCut | Phone layout | 3 |
| Hold the preview to see the original | CapCut | Touch compare, alongside a visible Compare button | 3 |
| Preset thumbnails rendered from the current photo | CapCut | Presets, once presets exist | Later |

These are workflow references, not claims of feature parity. The dimensions, wireframes, shortcuts, agent interaction, and hold-to-compare behavior below are product proposals. Do not copy branded assets or reproduce the full layouts of the reference products.

### Desktop: photo first, one inspector

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ Home  portrait.heic · Saved in browser   Undo Redo   Compare   Commands   Export │
├────────┬─────────────────────────────────────────────────┬─────────────────────┤
│ Edit   │                                                 │ Editing: Whole photo│
│ Mask   │                                                 │ Histogram           │
│ Retouch│                                                 │                     │
│ Crop   │               Photo canvas                      │ Light               │
│        │                                                 │ Exposure      +0.40 │
│        │                                                 │ ─────────●────────  │
│        │                                                 │ Contrast        +10 │
│        │                                                 │ ────────●─────────  │
│        │                                                 │ …                   │
│        │                                                 │ Color               │
│        │                                                 │ Curves              │
│        │                                                 │ Detail              │
├────────┴─────────────────────────────────────────────────┴─────────────────────┤
│ Fit  100%  Zoom                     Versions       Agent: connected · Activity │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Tool rail:** Edit, Mask, Retouch, Crop. Detail and Enhance live inside Edit rather than creating a second competing editing mode.
- **Canvas:** largest area, stable neutral surround, adjustable separately from light/dark chrome. Avoid translucent panels tinting the image while judging color.
- **Inspector:** roughly 320–360 px to start, resizable where space permits. Use full-width sliders and an expandable curve editor. At narrow desktop widths, collapse secondary navigation before shrinking the photo excessively.
- **Context drawer:** appears beside the rail only when masks or retouches need a list. Start near 220 px; allow collapse. Call it **Masks** or **Retouches**, not a generic Layers system that implies arbitrary compositing.
- **Scope:** always show **Editing: Whole photo** or **Editing: Sky**. A visible **Whole photo** action returns to global editing. Preserve each scope's open section and scroll position.
- **Histogram:** compact and collapsible. Global output histogram by default; regional measurements are explicitly labeled. Camera metadata belongs in a Photo info disclosure.
- **History and agent activity:** one click away. Show a compact running-job status when necessary; do not reserve a permanent chat column. Agent updates never steal keyboard focus, move the person's viewport, or switch their selected mask. **Inspect changes** navigates intentionally.
- **Compare:** same zoom and pan on both sides. Distinguish original rendering, previous version, and current proposal. For RAW, “Original” means the app's neutral/as-shot development, not unprocessed sensor data.

### Masking state

```text
Masks                         Canvas                     Inspector
+ Create mask                                            Editing: Sky
◉ Sky                         overlay + handles          Whole photo ↗
  + Sky selection                                        Amount       100%
  − Brush correction                                     Exposure    −0.30
○ Subject                                                Temperature   −12
                                                        Overlay  Show
```

A mask contains selection components; it is not a copy of the photo. Show rename, visibility, duplicate, invert, and delete through visible controls/menu affordances. **Add, Subtract, Intersect** operate on the selected mask. Distinguish mask opacity from a brush stroke's flow.

### Phone: a focused control surface

```text
┌────────────────────────────┐
│ Home  Saved  Undo   Export │
│                            │
│        Photo canvas        │
│                            │
│ Compare                    │
├────────────────────────────┤
│ Editing: Sky  · Whole photo│
│ Exposure             −0.30 │
│ ───────────●────────────── │
│ Exposure Contrast Shadows ›│
├────────────────────────────┤
│ Edit   Mask   Retouch  Crop│
└────────────────────────────┘
```

The bottom sheet grows for curves, mask components, and export settings; it can collapse to inspect the whole image. Tap the value to type precisely. A visible Compare control also supports press-and-hold. One finger paints in Brush mode; two fingers navigate. An explicit Pan control remains available. Keep touch targets at least 44 px, and preserve edits, selection, focus, and zoom during rotation/resizing.

**Release recommendation:** design both layouts together and ship the beta usable on both phone and desktop. Every beta feature must be reachable and comfortable by touch as well as by mouse and keyboard. Precision-heavy work (fine brush masks, curve points) may feel best on desktop at first; improve touch precision in milestone 3 without removing anything from the phone.

### Minimal, simple UI

- **Photo first.** The photo takes most of the screen; controls stay out of its way.
- **Show only what the task needs.** One inspector on desktop, one active control on phone; advanced controls are one tap away, never hidden without a visible entry point.
- **Plain words.** Labels such as Light, Color, Mask, Remove, and Export; no jargon the user did not bring.
- **Few, consistent controls.** The same slider, value field, and reset behaviour everywhere, so learning one teaches all of them.
- **No tutorial needed.** If a core action needs explanation, simplify the flow instead.
- Follow the existing Minimal design system for type, spacing, controls, and states.

### Design language and disclosure

Use the existing Minimal design system for typography, tokens, controls, focus, and states. Keep photographic exceptions explicit: neutral canvas surround, RGB histograms, temperature/hue tracks, grading wheels, and selectable mask-overlay colors carry information. Pair color with labels or shapes.

Always visible: the photo, current edit scope, save/failure status, active tool, compare access, and export access. One interaction away: advanced color controls, mask components, versions, activity, and file details. Dedicated settings: model downloads, storage, connection permissions, display preferences, and metadata defaults. No tutorial is required to find a core feature.

## 4. Interaction specification

| Control or state | Required behavior |
| --- | --- |
| Sliders | Full-width track, editable numeric value, unit where meaningful, reset action. Arrow keys make small steps; modified arrows make larger steps. Scrubbing is an additional shortcut. |
| History | One slider gesture, brush stroke, or agent batch creates one logical entry. Preview updates do not flood history. |
| Curves | Large graph on demand, RGB/channel selector, histogram backdrop, point coordinates, keyboard editing, per-channel reset. Define interpolation and prevent invalid point ordering. Parametric curves can follow point curves. |
| Color mixer / HSL | Eight named color bands, H/S/L values, and a targeted picker. Keep selected band visible; support numeric editing. |
| Color grading | Shadows, midtones, highlights; hue/saturation/luminance values plus balance and blending. Wheels and numeric fields must edit the same values. |
| Brush | Size, feather, flow, erase, overlay; pressure support when available, with usable mouse/touch behavior. Source-image scale determines brush size. |
| Gradients and shapes | Direct handles plus numeric geometry, rotation, feather, invert. Rectangle, ellipse, and polygon masks. |
| Retouch | Target and source are inspectable. Heal and Clone allow source correction. Inpaint variants are stored separately and never replace the original. |
| Commands | Search “sky,” “exposure,” or “export”; show matching actions. Explicit syntax such as “set exposure 0.5” and “increase exposure 0.5” avoids ambiguity. Optional natural-language interpretation comes later. |
| Shortcuts | Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo, Cmd/Ctrl+K commands; proposed O for overlay and brackets for brush size. Disable editing shortcuts while typing. Every action also has a visible UI route. |
| Long jobs | Show actual stage and cancel. Use numerical progress for bytes/tiles when available; use truthful indeterminate status for inference without progress signals. |
| Errors | Say what failed and offer a specific recovery action. Keep the last committed image usable. |
| Accessibility | Labeled controls, keyboard access, visible focus, screen-reader values, sufficient contrast, reduced motion, and editable numeric alternatives to graphical controls. |

## 5. Feature coverage and release priorities

Numbers refer to the milestones in section 10: **1** internal alpha, **2** first useful beta, **3** professional foundation, **4** advanced enhancement, **R** research, promoted individually on evidence.

| Capability | First version | Milestone | Later | Definition and limits |
| --- | --- | --- | --- | --- |
| Tone | Exposure, contrast, highlights, shadows, whites, blacks | 1 | More sophisticated highlight recovery (3) | Bounded, documented behavior; a clipped JPEG does not contain recoverable scene detail. |
| Color | Temperature/tint, vibrance, saturation | 1 | Point-color refinement (R) | RAW temperature has different semantics from relative JPEG warmth. |
| Color mixer (HSL) | Eight bands × hue/saturation/luminance, targeted picker | 2 | — | — |
| Curves | Master RGB + per-channel point curves | 1 | Parametric curves, targeted curve editing (2) | Stable interpolation, versioned semantics. |
| Color grading | Shadows/midtones/highlights, balance, blending | 2 | Global wheel (3) | Wheels and numbers edit the same values. |
| Auto tone and auto white balance | One-tap **Auto** that proposes values into the normal sliders | 2 | Per-mask auto (R) | Produces ordinary editable values, never a hidden effect. Agents get the same proposal through `suggest`. |
| Geometry | Crop, rotate, straighten, flip | 1 | Lens profiles, distortion, perspective (3) | Geometry changes preserve image-anchored masks. |
| Manual masks | Brush, linear/radial gradients, rectangle/ellipse/polygon; combine and invert | 2 | Color/luminance range (2–3), depth range (R) | Local tone/color first; add local detail only when validated. |
| Automatic selections | Subject, sky, background on a tested device/model tier | 2 | Object prompts, people parts (R) | Manual correction always available; failed detection may return “No sky found.” |
| Detail | Basic sharpening and classic luminance/chroma noise reduction | 2 | AI denoise (4) | Judge at 100%; proxy softness is not an export promise. |
| Texture/effects | Vignette | 2 | Texture, clarity, dehaze, grain (3) | Edge-aware operators need artifact and performance validation. |
| Blemishes | Tap/brush Heal and Clone | 2 | Automatic candidate detection with preview and per-spot exclusion (4) | Preserve skin texture; avoid automatically treating moles or freckles as defects. |
| Object removal | Small-area healing where a useful source exists | 2 | Local inpainting (4), optional cloud inpainting (4) | Clearly distinguish sampled content from synthesized content. |
| Shadows | Manual local correction using masks | 2 | Assisted shadow masks and relighting (R) | Reducing darkness cannot reconstruct obscured scene information. |
| Reflections | Manual masking/retouch assistance | 2 | Dedicated removal (R) | No guaranteed general-purpose removal milestone. |
| RAW development | Technical proof only | 0 | Tested camera list, profiles, Raw Details (3) | “RAW refinement” is the proposed product label for the improved demosaic. |
| Super resolution | — | — | 2× (4); 4× after validation (R) | A derived image with an inspectable comparison; added detail may be inferred. |
| Presets and copy/paste settings | — | — | Presets with thumbnails rendered from the current photo (3) | A preset is a partial recipe; agents apply it with one `apply_edits` call. |

All released controls must have GUI/API parity. A milestone is a release objective, not a claim that a suitable model or browser implementation has already passed evaluation.

## 6. File support and preserving the original

### Three distinct files

1. **Original:** the imported byte stream, immutable and content-hashed. Reading metadata or decoding it never overwrites it.
2. **Editable project:** original, versioned recipe, referenced masks/patches/enhancements, profiles, and a manifest. Proposed portable extension: `.photo-project` (a documented archive/container).
3. **Rendered export:** a new JPEG, PNG, WebP, or other supported output. This is the edited result, not an overwritten RAW file.

A small `.photo.json` recipe sidecar is useful, but is not self-contained when it references masks or generated assets. Export it with an asset folder or clearly require the matching project. Reattach missing sources by content hash. Do not imply that this recipe is Lightroom-compatible XMP; a limited mapping can be researched later.

### Import policy

| Format | Planned support | Important boundary |
| --- | --- | --- |
| JPEG / JPG / jpg | Milestone 1 | Same format regardless of extension case. Test EXIF rotation, profiles, progressive files, and CMYK conversion paths. |
| PNG | Milestone 1 for tested 8-bit inputs | Preserve transparency. Full 16-bit fidelity is a separate validated path. |
| WebP | Milestone 1, static image | Animation must be identified; select one frame rather than silently discard it. |
| HEIF / HEIC | Probe in milestone 0; ship in 2 if its gate passes | Test real phone files and codec variants. Do not equate opening a thumbnail with full-resolution decoding. |
| AVIF | 8-bit SDR through native decode in milestone 2; capability-gated | High bit depth, profiles, and HDR are handled separately (milestone 3 or later). |
| GIF | Milestone 2: first frame through native decode; frame picker later | One chosen, composited frame becomes the editing surface; keep the original animation file. No animation export initially. |
| BMP | Milestone 2 through native decode | Cheap because browsers decode it natively; test supported compression and bit-depth variants and reject the rest clearly. |
| TIFF | Milestone 3 | Start with common RGB/grayscale 8/16-bit subsets; page picker where supported. Report unsupported compression, CMYK, or other variants explicitly. |
| Camera RAW: DNG, CR2/CR3, NEF, ARW, RAF, ORF, RW2, etc. | Milestone 3, explicit tested camera list | Support depends on camera, encoding, and decoder build, not extension alone. Embedded preview is a labeled temporary view. |
| PDF | Milestone 3 page-import adapter (pdf.js-class renderer) | Select page and rasterization size; preserve the PDF original. The editing surface is a rasterized page, not an editable PDF or extracted original photo. |
| JPEG XL and further formats | Expansion | Add only after demonstrated demand and codec validation. |

Inspect signatures and decoder results, not just filename extensions. Apply dimension/page/frame/memory limits before expensive allocation. Report format, decoded dimensions, retained precision, profile handling, and any conversion loss in Photo info and the agent result.

Native browser decoding is useful, but cannot be the universal color/precision contract. Modern APIs include float16 pixel paths; availability alone does not prove full codec and profile fidelity. Use tested native paths where appropriate and dedicated decoders where required. [MDN: getImageData settings](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData)

**HDR policy:** begin with an explicitly SDR editing/output workflow. Detect HDR/gain-map inputs; offer a labeled SDR rendition or explain unsupported handling. Preserve source bytes and do not silently claim HDR round-trip fidelity.

### Export policy

- Beta: JPEG and PNG; WebP where the chosen encoder meets the contract. Default delivery color space: sRGB.
- Professional foundation: 16-bit PNG/TIFF and tested Display P3 export, with explicit color conversion and embedded profile support.
- Later: AVIF, PDF wrapping, HDR export, and other codecs if justified.
- Always expose dimensions, format, quality where applicable, color space, alpha handling, and metadata policy. JPEG requires an explicit background for transparent pixels.
- Default: strip location and device-owner identifiers from rendered exports; retain supported copyright/creator attribution. Offer a camera-settings preset and custom metadata choices. Keep original metadata untouched in the project.
- Rewrite orientation and dimensions to match the export; do not blindly copy metadata that no longer describes the image.
- Export a pinned project revision, never whichever state happens to exist when a long job finishes. Return the actual format, dimensions, profile, bit depth, and warnings.

Verify the actual encoded MIME type and properties. Browser canvas encoding can fall back to PNG for an unsupported requested type; import support does not imply export support. Use a dedicated encoder when the required precision/profile/metadata contract demands it. [MDN: canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)

## 7. Architecture and image quality

### One domain model, multiple clients

```text
Human GUI ─────┐
              ├─→ Command service → Project revisions → Render graph → Preview / export
Agent adapter ┘          │                  │                 ↑
                        │                  └─→ Asset store ──┘
                        └─→ Jobs → Decode / segmentation / retouch / enhancement
```

The command service validates edits, resolves capabilities, applies transactions, and records provenance. GUI and agents use that same service. React view state, browser transport, storage, and model inference remain separate from the photographic operations.

### Versioned project model

| Record | Required information |
| --- | --- |
| Source | Content hash, MIME/decoder identity, original dimensions, orientation, profile/metadata references. |
| Recipe | Schema version, processing version, source ID, develop settings, geometry, global controls, ordered local adjustments, retouch and enhancement references. |
| Mask | Stable ID/name, coordinate-space version, ordered composition, opacity, vector/brush instructions and referenced raster assets. |
| Derived asset | Content hash, dimensions, precision, color domain, alpha convention, creator/model/version, input revision/hash, parameters, seed if applicable. |
| Revision | Parent, author, batch label, changed values and asset references; named snapshots and export provenance. |
| View state | Zoom, pan, selected tool/mask, open sections; separate from the photo recipe. |

Old projects retain their processing version. A processing upgrade creates a reviewable version instead of silently changing an existing edit. Missing assets and unsupported versions are explicit errors.

Promise stable semantics and bounded visual differences across supported devices. GPU floating-point rules permit implementation variation; identical exported bytes would require a separately pinned canonical rendering/encoding path. Cached AI assets alone do not establish bit-exact output. [WGSL floating-point evaluation](https://gpuweb.github.io/gpuweb/wgsl/#floating-point-evaluation)

### Processing domains and order

Use a fixed, versioned graph for global controls so setting the same final values gives the same result regardless of the order sliders were moved. Ordered masks and retouch operations remain ordered; their order can affect the result.

1. **Ingest and decode:** validate input, preserve bytes, resolve orientation/profile. RAW begins with sensor-specific handling; a rendered JPEG begins with its already-rendered color values.
2. **Develop:** RAW black/white levels, applicable raw-domain denoise, demosaic, as-shot/custom white balance, and camera-to-working-color transform. Rendered formats take their documented input transform instead.
3. **Base preparation:** supported detail/enhancement stages and lens/geometry transforms, with explicit mapping back to source coordinates. Model input/output domains are declared, not assumed.
4. **Retouch:** composite stored clone/heal/inpaint results in a specified domain, with input dependencies recorded.
5. **Global adjustments:** exposure/tone, curves, color mixer/grading, and presence operators. Each operation declares its linear, log, or perceptual domain and the necessary conversions.
6. **Local adjustments:** evaluate masks and the supported adjustment subset in a documented sequence, including overlap behavior.
7. **Output:** crop, resize, output sharpening at final size, optional effects, gamut/output transform, quantization/dither as needed, and encoding.

This is a proposed graph to validate, not a claim about Adobe's internal pipeline. Fix precise placement of detail, retouch, tone mapping, and local edits during milestone 0 using reference images. Record the decision as a processing-version contract.

**Color decisions:** evaluate an explicit wide-gamut working space and sufficient precision; do not simply call every intermediate “scene-linear.” A linearized rendered JPEG remains rendered data. Preserve out-of-range values where the operation requires it; avoid premature clipping. HSL, grading, tone curves, and ML models need documented spaces. Evaluate float16 storage with higher precision for sensitive calculations. Display transform and file encoding are separate capabilities.

**RAW quality:** a decoder is only part of a development system. LibRaw explicitly excludes production-quality rendering from its core scope. Camera profiles, highlight treatment, demosaic quality, color, and noise still need evaluation. Start with a small camera/encoding corpus and expand based on evidence. [LibRaw overview](https://www.libraw.org/about)

### Coordinates, masks, and dependencies

- Store canonical image coordinates after EXIF orientation and before user crop/geometry, with dimensions and pixel-center conventions defined.
- Convert canvas positions through the full inverse transform; normalized 0–1 values alone do not solve rotate, perspective, lens correction, or enhancement mapping.
- Keep crop as a view/output operation. Define brush width and feather in source-image units, with a user-friendly screen representation.
- Save brush strokes/pressure where useful for rerasterization and cache raster tiles. Keep gradient and shape masks parametric.
- Define soft-mask combination math and ordering once. Test feathered overlaps and transparency. Background selection is not always a perfect inverse subject mask; support refinement.
- Snapshot range masks or record their input-stage dependency; changing exposure must not cause unexplained mask movement.
- When upstream inputs change, mark dependent generated patches/enhancements stale. Offer a retained frozen result or explicit recomputation. Never silently regenerate AI output.
- Super resolution is a derived base with a known scale/transform. Validate that masks, patches, crop, and history still map correctly; reject incompatible combinations with a useful explanation.

### Performance approach

WebGPU is the leading candidate, with worker-based decode and processing. Prove a practical fallback using a reduced CPU/WASM path or a deliberate WebGL2 subset; do not promise a second equivalent renderer for free.

Use a capped screen-resolution proxy during interaction, progressive refinement afterward, and full-resolution visible tiles at 100%. Export from the authoritative source/graph and full-resolution derived assets, never from a canvas screenshot.

A 45 MP RGBA float16 buffer is about 360 MB before any additional buffers. Tiling must therefore cover the whole expensive path, including decoder and encoder constraints. Neighborhood filters and models need overlap/halo regions; global tone statistics need shared analysis. Otherwise tiles produce seams or inconsistent tone. Do not assume a decoder can stream merely because rendering is tiled.

On GPU loss, cancel/rebuild transient resources and preserve the committed project. Prioritize interaction above background inference, bound caches, and degrade preview resolution rather than freezing the UI.

### Persistence and recovery

Use OPFS for large originals/assets and IndexedDB for manifests and revisions where supported. Browser storage is quota-managed and can be evicted; a persistence request improves behavior but is not a backup. [MDN: storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

Write and verify assets first, then atomically commit a manifest referencing them. Show **Saved in browser** only after the required writes finish. Use a recovery journal because OPFS and IndexedDB do not form one shared transaction. Keep assets reachable from saved history; garbage-collect only unreferenced assets.

Provide **Save project to file**, storage usage, quota-failure recovery, and reattach-original flows. Stream large project exports where possible. Multiple tabs must use revision checks or a single-writer lock. In memory-only mode, keep editing available and clearly ask the user to export a project before leaving.

### Reuse from ajwoo draw

Repository inspection found React/Vite/TypeScript, shared UI controls/tokens, snapshot history, IndexedDB session persistence, and image-provider plumbing. Reuse UI primitives and interaction ideas after checking their fit. The existing history and database types are drawing-specific and are not a photo project store. The provider path currently expects PNG references and needs a separate review for photo fidelity, metadata, crop context, and authorization.

Recommended starting arrangement: a separate photo application entry and photo domain modules in the same repository, sharing only stable UI/utilities. Keep its persistence namespace and tests separate. Decide whether to split the repository after the technical proofs, before strong cross-app dependencies accumulate.

## 8. Agent interface and human–agent handoff

### Contract

**A good agent interface minimizes guessing, round trips, and accidental work.** It must be usable without reading the DOM, while the GUI remains accessible to browser/computer-use agents.

| Interface | Purpose |
| --- | --- |
| `get_capabilities` | Runtime-supported formats, controls/scopes, models, precision tiers, limits, and connection permissions. |
| `open_project` / `get_state` | Import or reopen; return project ID, revision, source status, compact recipe summary, and optional thumbnail. |
| `describe_controls` | Filterable schema: stable ID, type, unit, range/default/step, allowed scopes, meaning, and dependencies. |
| `analyze` | Requested histogram/clipping or region statistics; explicit domain, sample resolution, revision, and confidence for estimates. |
| `create_mask` | Manual or semantic selection; return stable ID, coverage, provenance, and overlay preview or job handle. |
| `suggest` | Proposed values for an intent such as auto tone, auto white balance, or straighten; returned as a draft batch the agent or person can apply, change, or discard. |
| `apply_edits` | Atomic batch of validated absolute edits, optional mask creation/references, expected revision, and idempotency key. |
| `retouch` / `enhance` | Typed operation, input revision and region, quality/cost policy, and a job/result handle. |
| `render_preview` | Bounded preview, before/after pair, mask overlay, or a full-resolution region at a specified revision. |
| `get_job` / `cancel_job` | Progress/stage, completion, cancellation, and durable result handles. |
| `get_history` / `restore_revision` | Inspect changes and restore by creating a new revision; no accidental deletion of later work. |
| `export` / `save_project` | Pin revision, render or package, return a file handle and truthful receipt. |

Publish input and output schemas from the same control registry that supplies GUI metadata. The full registry is cached; agents request only needed sections. Return concise diffs by default, with preview/file handles rather than large base64 payloads. Heavy segmentation and face/region detection are opt-in analysis, not a mandatory import cost.

### Control registry entry — the single source for GUI and API

Every slider, field, and menu in the GUI is generated from, or checked against, one registry entry like this. `describe_controls` returns the same entries, so a control cannot exist on one side without the other.

```json
{
  "id": "light.exposure",
  "label": "Exposure",
  "group": "Light",
  "type": "number",
  "unit": "EV",
  "range": [-5, 5],
  "default": 0,
  "step": 0.01,
  "scopes": ["global", "mask"],
  "meaning": "Brightens or darkens the whole tonal range, in stops.",
  "since": "processing-1"
}
```

### Transaction sketch — proposed data contract, not implementation

```json
{
  "projectId": "photo_01",
  "expectedRevision": "r12",
  "idempotencyKey": "edit-session7-step3",
  "label": "Balance exposure and cool the sky",
  "ops": [
    { "op": "set", "target": "global", "control": "light.exposure", "value": 0.35 },
    { "op": "set", "target": "mask_sky", "control": "color.temperatureOffset", "value": -12 }
  ],
  "return": { "diff": true, "previewMaxEdge": 1024 }
}
```

Required semantics:

- Absolute settings are preferred. Relative adjustments require idempotency protection and return resolved values.
- Reject unknown controls, unsupported scopes, non-finite numbers, invalid curves, and out-of-range values before committing any part of a batch. `coerce: true`, if supported, must be explicit and report each correction.
- Reusing an idempotency key with the same payload returns the existing outcome; a different payload is an error.
- On revision conflict, return the current revision and relevant changes. Never silently overwrite a human edit. Initially serialize writers; consider automatic merging only for proven independent edits later.
- Slow model jobs reference an input revision. Their results become assets/proposals; they cannot commit to a changed project without validation.
- Each committed batch produces one history entry. Dry-run/preview uses a draft revision, with no hidden changes to the committed project.
- Statistics describe their measurement space and whether they are approximate. White-balance, noise, and semantic classifications are estimates, not objective judgments of taste.
- Always allow visual verification. Low tool count is useful; “no screenshots required” is not a substitute for checking halos, skin texture, mask leakage, or invented detail.

### Transport and file access

Prove both the in-page typed API and one real external-agent adapter early. A local MCP adapter is the recommended first external path; stdio is a suitable starting transport. Keep application commands independent of protocol version and use current supported MCP schemas. [MCP transport overview](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)

A browser cannot read an arbitrary disk path just because an agent supplied a string. Browser imports use selected File/Blob handles; a local adapter can use explicitly scoped filesystem access. External agents need either a bridge to the live browser project or an explicitly separate headless session with its own storage. Do not imply that a headless browser automatically shares the visible tab's state.

For live handoff, expose a visible **Connect agent** session and project scope. For headless work, return a project artifact that can be opened in the GUI. Test GPU availability and fallback in the actual chosen headless environment. Add an embed/postMessage API only when needed, with explicit origin checks.

### Autonomy without constant prompts

Choose permissions once for the project/session: read-only, reversible edits, and export to a selected destination. A user can also select **Review proposals** for agent work. Ordinary authorized slider and mask edits commit directly and remain undoable.

Show **Pause agent / Take over** while an agent is active. Pausing stops future commits; cancellation of an in-flight model may be cooperative. No fake cursor is necessary: show the affected region, the batch label, and the result.

Cloud upload, paid processing, and writes outside the selected destination need separate scoped authorization. Report that requirement as structured status rather than hanging a headless agent behind a dialog.

## 9. AI, removal, and enhancement strategy

| Operation | What it actually does | Product treatment |
| --- | --- | --- |
| Clone | Copies a chosen region | Deterministic source/target geometry and a movable source. |
| Heal | Samples surrounding/source texture and blends it | Small blemishes/dust first; keep the source editable. |
| Content-aware removal | Searches/reconstructs a plausible fill from available image content | Show the affected region and offer alternatives; repeated patterns need inspection. |
| Generative inpaint | Synthesizes pixels conditioned on the image/mask | Label as generated; cache output and provenance; do not imply factual recovery. |
| Shadow correction | Adjusts local tone/color, potentially with an inferred mask | Useful for mild/moderate shadows; difficult edges and missing texture need review. |
| Reflection removal | Attempts to separate overlapping reflected/transmitted content | Separate experimental evaluation with known failure cases. |
| RAW refinement | Improves the RAW development/demosaic path | Validate texture, false color, and camera compatibility. It is not equivalent to adding a sharper JPEG filter. |
| AI denoise | Estimates cleaner image data in a model-specific domain | Preserve texture and edges; compare at 100%; record the model/input version. |
| Super resolution | Produces a larger derived image | Evaluate 2× first; inspect faces, text, repeating texture, and consistency outside the target region. |

Adobe's named Enhance features have specific input and processing behavior; use them as workflow references rather than promises that a generic model reproduces their results. [Adobe Enhance reference](https://helpx.adobe.com/lightroom-classic/help/enhance-details.html)

Evaluate candidate models against representative photos before choosing a runtime/model family. ONNX Runtime Web is a candidate; backend/operator support and model memory requirements need validation. [ONNX Runtime Web documentation](https://onnxruntime.ai/docs/tutorials/web/)

State scale precisely: 2× super resolution means twice the width and height, or four times the pixels; 4× means sixteen times the pixels. Include that expansion in memory, job-time, and export-size estimates.

Model selection criteria: edge quality, failure modes, download size, peak memory, warm/cold latency, supported device tier, weight provenance, redistribution terms, and ability to tile. Keep an inventory of exact decoder/runtime/model versions and licenses before adding them. HEIF codec selection and model-weight rights remain implementation decisions, not assumed permissions.

Download models on demand with actual size and a remove-download action. Cache them, but keep model downloads separate from user project assets. Offline editing continues with cached models and manual tools. Do not automatically send a photo to the cloud when a local model fails or is too slow.

If cloud editing is added, disclose provider, the pixels/metadata being sent, destination, and available cost information before authorization. A user-provided API key does not eliminate upload or credential handling requirements. Persist returned images/patches so reopening a project never reissues a paid generation request.

## 10. Delivery plan — milestones with exit criteria

No calendar promises yet. Estimate work after milestone 0; unknowns are primarily image quality, codecs, memory, and model fit.

| Milestone | Deliverable | Exit criterion |
| --- | --- | --- |
| 0 — Prove the risks | JPEG/HEIC/16-bit TIFF/representative RAW probes; color-managed preview/export experiment; one mask; storage round-trip; one actual agent connection. | Publish evidence for precision/color, large-file memory, fallback behavior, source-byte integrity, and live/headless agent handoff. Select supported device/format tiers. |
| 1 — Editing core, internal alpha | One JPEG/PNG/WebP workflow; tone/color, point curves; crop; compare; undo; project persistence/export; typed API. | The same recipe set by GUI or agent yields equivalent output; reload and portable project reopen succeed; exact original hash is preserved. |
| 2 — First useful beta | Manual masks, tested subject/sky/background selection, HSL/grading, Auto tone/white balance, basic detail, vignette, small Heal/Clone, command search, external-agent adapter. Native-decode imports for AVIF (SDR), GIF (first frame), and BMP. HEIC only if its gate passes. | A person and agent complete portrait/landscape workflows, refine masks, hand off editing, and export without losing or overwriting work. Both phone and desktop are supported surfaces. |
| 3 — Professional foundation | Tested RAW development and camera list, Raw Details, high-bit-depth/color-managed paths, TIFF/HEIC expansion, PDF page import, texture/clarity/dehaze, presets, large-image reliability; refined mobile precision workflow. | Camera/format/color corpus passes; export matches preview within defined tolerances; large projects recover across reload/crash and move between browsers. |
| 4 — Advanced enhancement | AI denoise, 2× super resolution, bounded object inpainting, optional cloud adapter if selected. | Each tool passes a separate visual/performance/license gate and has clear failure/recovery behavior. |
| Research / expansion | Reflection removal, assisted shadow removal, 4× upscale, depth/person parts, GIF frame picker, JPEG XL, HDR, batch/library. | Promote features individually after evidence; do not bundle research success into a fixed release promise. |

### Milestone 0 checklist

Each item ends in a written result: a number, a pass/fail, or a decision. Together they decide the device/format tiers and whether milestone 1 starts as planned.

| # | Experiment | Result to record |
| --- | --- | --- |
| 0.1 | Decode a fixture set of JPEG (with EXIF orientation, Display P3 and CMYK profiles), 8- and 16-bit PNG, HEIC from two recent phones, 16-bit TIFF, and DNG plus one CR3/NEF/ARW each, natively and through candidate WASM decoders | Per file: decoded dimensions, bit depth retained, profile handled, decode time, peak memory |
| 0.2 | Render exposure + contrast + one point curve on a 24 MP proxy in WebGPU, and in the chosen fallback | Frame time on the reference laptop and one mid-range phone; output difference between backends |
| 0.3 | Export the same edit to JPEG and PNG and compare with a CPU reference render | Worst-case and mean ΔE, region seams, actual encoded type and profile |
| 0.4 | Tile a 45 MP image through decode → render → encode | Peak memory per stage; whether the decoder or encoder forces a full-frame buffer |
| 0.5 | Run one subject and one sky model in the browser | Download size, cold/warm latency, peak memory, edge quality on hair and branches, weight license |
| 0.6 | Store an original in OPFS, edit, reload, export a portable project, import it in another browser | Original hash unchanged; recipe and mask assets intact; behavior when storage is cleared |
| 0.7 | Connect Claude Code to a live tab through a local MCP adapter, and separately to a headless session | Tool calls and payload size for “brighten the subject, cool the sky, export”; whether the person sees agent edits live |
| 0.8 | Paper-prototype the desktop and phone layouts with 3 people | Where they look for Mask, Compare, and Export; any mistaken-scope edits |

**Scope cut rule:** protect original preservation, useful local masks, GUI/API parity, and dependable export. Cut decorative effects, extra formats, secondary transports, and advanced AI before cutting those foundations.

## 11. Validation and success measures

Targets below are proposed acceptance budgets, not measured performance. Baselines are not yet collected. Milestone 0 must name reference devices, browsers, viewport/DPR, proxy dimensions, photo fixtures, and cold/warm cache conditions.

| Area | Proposed target / check |
| --- | --- |
| Perceived response | Acknowledge input within 100 ms; aim for a 16.7 ms interactive preview frame on the reference desktop and 33 ms on the supported touch tier, reducing proxy size as necessary. |
| Opening | Target first useful preview within 1 second for a cached-decoder 24 MP JPEG; report decode-ready separately. RAW embedded previews are not full RAW readiness. |
| Export | Start with a target of 10 seconds for a representative 24 MP basic JPEG edit on the reference laptop; report AI jobs separately and revise after measurement. |
| Human workflow | Test 5–8 representative users. At least 80% should complete open → global correction → subject/sky correction → export without coaching; record time and mistaken-scope edits. |
| Agent workflow | After cached discovery, target 4–6 logical tool calls for an already-imported ordinary local edit, including visual verification and export. Track waiting/polling separately and include token/payload costs. |
| Source integrity | Original hash unchanged through import, edits, reload, project export/import, and rendered export. |
| Recovery | Survive refresh, worker crash, GPU loss, interrupted asset write, quota failure, missing assets, and multi-tab contention without claiming unsaved work is saved. |
| Color | ICC/EXIF, neutral ramps, saturated patches, transparency, skin tones, gradients, and 8/16-bit fixtures. Compare under a defined output transform with agreed error thresholds. |
| Masks | Hair, fur, translucent edges, thin branches, similar subject/background colors, empty sky detection, and overlapping feathered components. |
| Detail/retouch | Inspect 100% crops for halos, plastic skin, repeated texture, seams, false detail, changed text, and changed untargeted regions. |
| Scale | Representative 24/45/60 MP inputs plus low-memory failure cases; measure peak memory across decode, rendering, encoding, and project packaging. |
| API correctness | Atomic rejection, schema parity, idempotent retry, stale revision handling, job cancellation, exact export revision, and recovery from disconnected agents. |
| Accessibility | Complete keyboard-only workflow, numeric alternatives, focus persistence, touch targets, and screen-reader control labels/values. |

Use a reference-render corpus plus per-operation tests. Cross-backend comparisons need agreed tolerances and visual review; an average ΔE alone can miss a severe local seam. Use region checks, edge/structure comparisons, and worst-case error distributions where appropriate. Verify same-runtime repeatability separately from cross-device similarity.

Build an agent evaluation set of roughly 30 varied photos with bounded intents and human scoring. Include impossible requests such as recovering texture from a fully clipped JPEG: success includes communicating the limitation and avoiding fabricated claims. Evaluate quality and latency together; do not optimize tool count at the cost of reliable inspection.

## 12. Review decisions and next planning artifacts

These are recommended defaults for review, not blockers to reading or refining this plan.

| Decision | Recommended default | Tradeoff |
| --- | --- | --- |
| App placement | Separate photo entry/domain inside ajwoo draw initially | Reuses stable UI while keeping the photo engine and storage isolated. |
| First audience | People on phone and desktop, plus externally connected agents | One responsive app reaches people wherever they edit; fine-precision touch work keeps improving after the beta. |
| First release | One-photo local-edit beta with masks and agent handoff | Delivers the differentiator before broad codec/AI coverage. |
| RAW timing | Technical proof immediately; supported release after quality validation | Avoids locking in an architecture unsuitable for RAW without pretending all cameras work. |
| Cloud | Optional extension after local workflow is dependable | Core editing stays usable without credentials; advanced fills may arrive later. |
| Agent autonomy | Direct reversible edits within a selected project; optional proposal mode | Fast operation with visible history and takeover. |
| Saving | Browser autosave plus portable editable project from the alpha | More storage work early, substantially better recovery. |
| Output | SDR/sRGB first; high-bit/P3 in professional foundation | Clear fidelity contract and a manageable validation surface. |

Before implementation, review these five planning artifacts: the desktop editing/masking states (section 3), the compact layout (section 3), the human–agent takeover flow (sections 2 and 8), the supported-format/precision matrix (section 6), and the milestone 0 checklist (section 10). A later clickable prototype can validate navigation and control density before the image engine is built.

**Planning deliverable complete when:** the intended workflow, first release, deferred research, original-file contract, agent connection model, and quality gates are agreed. This revision contains no application implementation.

## Appendix A. What changed from the first draft

The draft has a strong foundation: one edit model for GUI and API, original preservation, named masks, batched agent operations, and progressive previews. The following changes make it more realistic and reviewable.

| Issue | Why it matters | Revision |
| --- | --- | --- |
| The MVP includes many formats and almost all global controls, but postpones masks | It delays the distinctive subject/sky workflow the product is meant to serve. | Prove global edits first internally, then include manual masks and bounded AI selection in the first public beta. |
| MCP arrives in phase 4 | An in-page object alone does not establish that intended agents can connect. | Prove one real agent integration in milestone 0; ship it with the beta. |
| “Every edit is a parameter” | Healing, segmentation, and generative outputs also require persistent assets and provenance. | Define a project as original + recipe + immutable derived assets + version history. |
| “The same pixels everywhere” | GPU floating-point behavior and implementation changes prevent a universal bit-exact promise. | Version the engine and assets; specify image-quality tolerances across supported backends. |
| All processing is described as scene-linear | Linearizing a JPEG does not restore scene data, and perceptual controls and ML have their own domains. | Use a color-managed graph with explicit domains and conversions. |
| Browser formats are treated as simple yes/no support | Bit depth, profiles, animation, camera compression, and export support vary. | Publish tested subsets and runtime capabilities; distinguish full decode from preview-only. |
| OPFS is treated as durable ownership | Browser data can be cleared or evicted. | Make portable project export and verified source reattachment core capabilities. |
| Nearby-texture removal is grouped with reflection and shadow removal | They are different problems with different failure modes. | Separate clone, heal, inpaint, shadow correction, and reflection research. |
| Invalid agent values are clamped by default | A successful-looking call can quietly change the agent's intended edit. | Reject invalid batches atomically; allow explicitly requested coercion with a reported diff. |
| Several permanent panels and an activity log compete with the photo | The workspace becomes busy before the user starts editing. | One inspector, contextual mask/retouch drawer, activity one action away. |
| “Fast” mostly means frame rate or tool count | A fast incorrect edit is still a failure. | Measure completion time, visual quality, repair work, latency, memory, and tool overhead together. |

The architectural corrections are developed in sections 7–9, with primary references alongside the relevant claims.

### Third revision

- Moved this critique out of the main plan into this appendix so the plan reads as a plan.
- Restored the specific Lightroom, Figma, and CapCut patterns to borrow (section 3), each assigned to a milestone.
- Replaced the separate B/P/R labels with the milestone numbers used in section 10, so each feature has one schedule.
- Added one-tap Auto tone/white balance, the matching `suggest` agent tool, and presets, because they are the biggest speed gains for both people and agents.
- Moved AVIF (SDR), GIF (first frame), and BMP to milestone 2 because browsers already decode them; PDF to milestone 3.
- Added a control registry example showing how one entry drives both the GUI and the API (section 8).
- Wrote the milestone 0 checklist that the review list referred to but did not contain (section 10).


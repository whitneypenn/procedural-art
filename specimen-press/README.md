# Specimen Press

Procedural mineral specimens drawn as 19th-century hand-coloured engravings: the kind of plate you'd find in an old mineralogy atlas. Every plate comes from a seed, so the same seed always draws the same specimen.

## Pages

| File | What it is |
|---|---|
| `index.html` | The Specimen Press: a whole plate of specimens under one title, printed as an atlas plate. Choose a subject (The Mineral Kingdom, Quartz & its Varieties, Agates, Precious Stones, Ores, A Cabinet of Minerals), a colouring (a family of colours or a single mineral's palette), how many figures, and the fineness, up to 3600 × 4800 px for printing. Titles, subtitles and the explanation of the plate are generated from what is on it; the register number travels in the link, and Download saves a PNG. |
| `specimen.html` | One specimen at a time, with seed, kind, palette, specimen size and image size controls. <kbd>Space</kbd> draws a new specimen, <kbd>←</kbd> <kbd>→</kbd> step through seeds. |
| `catalogue.html` | Every specimen kind in every palette, one example per square. Click a plate to see it larger. |
| `tools/review.html` | Side-by-side review sheet for development. Query parameters: `kind`, `type` (sub-type, e.g. `sunburst`, `waterline`, `veins`), `pal`, `n`, `cols`, `seed`, `scale`, `w`, `label=0`. |
| `specimen-engine.js` | The drawing engine all the pages share. |
| `poster.js` | Poster planning, layout and printing, on top of the engine. |

No build step and no dependencies beyond Google Fonts. Serve the folder with any static server, for example:

```sh
ruby -run -e httpd . -p 8765
```

then open <http://localhost:8765/>. Opening the HTML files directly from disk also works.

## What it draws

| Kind | Variants |
|---|---|
| Single crystal | Terminated prism, striated column, doubly terminated, octahedron, cube (plain or pyrite-striated), tabular; often still set in a piece of matrix |
| Crystal cluster | Druse, crystal crust, parallel growth, sceptre quartz, stepped cubes, penetration twin, scattered cubes or octahedra, radiating sunburst |
| Banded section | Druzy geode, hollow nodule, cloud agate, banded agate, water-line onyx; optional fortification banding |
| Polished slab | Porphyry, granite, veined marble, breccia, shell limestone, banded jasper |
| Crystals on matrix | A hero crystal with smaller ones grouped around it, sometimes in a druzy cavity |
| Rough specimen | Veined matrix, stratified stone, flecked matrix, nodule with a polished window, druzy patch, massive banded stone, pitted ore |
| Cut stone | Round/oval brilliant, rose, step, pear, cushion, marquise, table, baguette, briolette, cabochon; often with a side-profile view |

18 palettes with invented cabinet names (Dusk Lazuline, Honeyglass, Widow's Coal…), including three two-tone ones (Twilight Spar, Peacock Ore, Melon-rind Schorl) whose second colour shows up as zoned crystals, alternating bands and bicolour stones. Names are invented from colour roots that match the palette, so a blue stone gets a blue-sounding name.

## How it works

- **Crystals are real 3D solids** (prisms, pyramids, cubes, octahedra) rotated and projected, with every face shaded from one light. Interpenetrating twins are drawn by clipping each solid's faces against the other's planes.
- **Two print layers.** Watercolour washes go on a colour layer and engraved linework (hatching, stipple, outlines) on an ink layer. They are combined like a print, with the colour layer slightly offset for misregistration.
- **Paper** gets grain, fibres, foxing spots and uneven ageing.
- **Shape and rendering use separate random streams**, so changing palette or size keeps the same specimen.

## References

The look is based on:

- James Sowerby, *British Mineralogy* (1804–17): hand-coloured copperplate engravings ([Public Domain Review](https://publicdomainreview.org/collection/sowerby-mineralogy/))
- Kenngott & Schubert, *Illustrierte Mineralogie*: 19th-century German chromolithograph plates ([Picture Box Blue](https://www.pictureboxblue.com/colourful-vintage-mineralogy-art/))
- *Meyers Konversations-Lexikon* (1897), "Mineralien und Gesteine" plate

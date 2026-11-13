# Fonts for the link preview image

`src/app/opengraph-image.tsx` reads these files at build time. The image renderer reads only TTF, OTF and WOFF files, not the WOFF2 files that `next/font` serves to the site.

| File | Font | Weight |
|---|---|---|
| `JosefinSans-Light.ttf` | Josefin Sans | 300 |
| `JosefinSans-Regular.ttf` | Josefin Sans | 400 |
| `JosefinSans-SemiBold.ttf` | Josefin Sans | 600 |
| `Arimo-Regular.ttf` | Arimo | 400 |

- **Source:** Fontsource 5.3.0 (`cdn.jsdelivr.net/fontsource/fonts/…/latin-<weight>-normal.ttf`), unchanged.
- **Characters:** the Latin subset only.
- **Licence:** both fonts are under the SIL Open Font License 1.1. See `OFL-JosefinSans.txt` and `OFL-Arimo.txt`.

# Latitude identity

`latitude-master.png` is the original, unaltered artwork supplied for Latitude: a near-black globe with lime latitude bands. Its transparency, shading and colors are retained. Keep it as the source of truth; do not redraw it as the previous wireframe globe.

Production exports are static images with no runtime effect or added dependency:

- `assets/logo-128.png`: app header, including high-density displays.
- `assets/icon.png`: 512 px desktop/Linux window icon and GitHub README mark.
- `assets/icon.ico`: Windows app, installer and shortcuts; contains 16, 24, 32, 48, 64, 128 and 256 px images.
- `assets/favicon-32.png`: browser preview icon.

To reproduce these exports from the repository root with ImageMagick 6 (`convert`; use `magick` on version 7):

```sh
convert branding/latitude-master.png -resize 512x512 -strip -define png:compression-level=9 assets/icon.png
convert branding/latitude-master.png -resize 128x128 -strip -define png:compression-level=9 assets/logo-128.png
convert branding/latitude-master.png -define icon:auto-resize=256,128,64,48,32,24,16 assets/icon.ico
convert branding/latitude-master.png -resize 32x32 -strip assets/favicon-32.png
```

The homepage uses the same exports for its header/footer and social image, plus 180 px touch and 192 px browser icons. Source artwork stays outside the packaged app; only the small exports ship. New screenshots must come from the actual app, rather than painting a logo over an older capture. Historical release tags keep their original artwork.

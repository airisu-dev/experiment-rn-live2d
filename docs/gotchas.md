# Gotchas

## Licensing
Cubism Core is proprietary. It most likely **cannot be bundled** in the npm package. `pixi-live2d-display` handles this by making users supply the Core themselves. Plan for an **Expo config plugin or postinstall step** that points to a Core the user downloads. Read the Live2D license terms carefully before publishing.

## Assets
`model3.json` references `.moc3`, textures, motions and physics files by relative path.
- Add `moc3` and `motion3.json` (and other Cubism file types) to Metro's `assetExts`.
- Resolve the bundle to real file paths natively.

## Premultiplied alpha
Cubism expects premultiplied alpha. Make sure texture loading and the shader agree, otherwise edges get dark halos.

## Moc consistency
Call `csmHasMocConsistency` on the `.moc3` before loading untrusted models.

## Coordinates
Cubism uses a unit space centered on the origin. Map to canvas pixels with a canvas-size / pixels-per-unit transform.

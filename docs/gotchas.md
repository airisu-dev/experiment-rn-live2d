# Gotchas

## Licensing
Cubism Core is proprietary. It most likely **cannot be bundled** in the npm package. `pixi-live2d-display` handles this by making users supply the Core themselves. Plan for an **Expo config plugin or postinstall step** that points to a Core the user downloads. Read the Live2D license terms carefully before publishing.

The Core, the Framework and the sample models all come from the one SDK download in the gitignored `packages/rn-live2d/vendor/CubismSdkForNative/`, so their versions always match and nothing from Live2D is committed. The Framework is also on GitHub (`Live2D/CubismNativeFramework`), but the Core is not, so the SDK download is needed anyway. If we ever need to patch the Framework, a forked submodule is the way to track it.

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

## Cubism JSON parser
The Cubism Native Framework parses its JSON files (model3, physics3, pose3, motion3, ...) with its own `Utils::CubismJson`, which only handles the layout Cubism Editor writes:
- A number must be followed by a newline or a comma (`CubismJson::ParseNumeric`). `{"A":1}`, `[1,2]` and `{"A": 1, "B": 2}` all fail.
- Exponents (`1e-7`) aren't supported.

`JSON.stringify(x)` breaks both rules. Send files through `toCubismJson` (`packages/rn-live2d/src/cubismJson.ts`): tab-indented, one value per line, exponents written out in full. Its loaders also don't check for parse errors and crash on bad JSON, so `Live2DUserModel` test-parses every input first and throws instead.

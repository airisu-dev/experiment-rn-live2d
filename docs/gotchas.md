# Gotchas

## Licensing
Cubism Core is proprietary. It most likely **cannot be bundled** in the npm package. `pixi-live2d-display` handles this by making users supply the Core themselves. Plan for an **Expo config plugin or postinstall step** that points to a Core the user downloads. Read the Live2D license terms carefully before publishing.

The **Cubism Native Framework** is open source and on GitHub, so it is a git submodule at `packages/rn-live2d/third_party/CubismNativeFramework`. The repo only stores the link and the pinned commit, never the files. The **Core** and the sample models are not on GitHub: they only ship in the SDK download, which `scripts/fetch-cubism-sdk.sh` puts in the gitignored `packages/rn-live2d/vendor/CubismSdkForNative/`. **Keep the two on the same version:** the submodule's tag (`5-r.5`) must match `VERSION` in the fetch script. To upgrade, check out the new tag in the submodule and update `VERSION` and `SHA256` together.

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

## Android release assets

In Android release builds, assets are embedded in the APK. For images, `expo-asset` skips the download and sets `localUri` to a bare drawable name (enough for `<Image>`), which `expo-file-system` rejects ("URI is not absolute"). `readAsset` in `loadModel.ts` clears that and calls `downloadAsync()`, which copies the resource into the cache. Debug builds never hit this: Metro serves assets over HTTP. Always check a release build before calling a loading change done.

## Worklet captures

A worklet copies everything it captures to its runtime. Capturing `globalThis` (even through a module constant) fails with "Trying to convert a cyclic object to a serializable". Reference `globalThis` inside the worklet body instead (see `src/clock.ts`).

## React Compiler and gesture callbacks

The React Compiler is on, and it compiles the workspace package too. A `let` reassigned in one gesture callback and read in another (both made in the same `useMemo`) wasn't seen by the other callback: the long-press drag set it in `onStart`, and `onUpdate` still read `null`. Keep such state on a mutable object (`{ current }`) or a ref (see `useLive2DGesture.ts`).

## Gesture handler events

- `Pan().activateAfterLongPress`: `onBegin` doesn't run before `onStart` the way you'd expect, so don't save the press position in `onBegin` for `onStart`. Read it from `onStart`'s own event; the finger has barely moved by then.
- Combining separate per-model gestures with `Gesture.Simultaneous` doesn't make their inner gestures simultaneous with each other. Use one gesture for all models (`useLive2DGestures`).

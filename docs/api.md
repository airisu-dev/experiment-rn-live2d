# Public API (pixi-live2d style)

```tsx
// A require.context of the model's folder: the files its model3.json lists are
// loaded from it. Or pass the files yourself as a Live2DModelSource.
const { model, error, loading, retry } = useLive2DModel(
  require.context('./Mao', true, /\.(json|moc3|png)$/)
);
const gesture = useLive2DGesture(model, { x, y, scale });

<GestureDetector gesture={gesture}>
  <Canvas style={{ flex: 1 }}>
    <Live2D model={model} x={x} y={y} scale={scale} />
  </Canvas>
</GestureDetector>
```

The app needs a `GestureHandlerRootView` at its root.

`useLive2DModel` loads once on mount and doesn't throw. It returns:
- **`model`:** the loaded model, `null` while loading or after an error.
- **`error`:** why the last load failed.
- **`loading`:** true while a load is in progress.
- **`retry()`:** loads again.

The source is read once, so remount the component to switch models.

## Loading from a URL

```tsx
const { model, error, retry } = useLive2DModel('https://example.com/haru/haru_greeter_t03.model3.json');
```

A string is the URL of a `model3.json`. The files it lists are resolved
relative to it, and spaces in file names are escaped.

- **Every file** (JSON, moc, textures) is fetched in parallel with
  `expo/fetch`. The only caching is the platform's HTTP cache, so a persistent
  offline copy is up to the app.
- **Motion sounds** are ignored.
- **Errors:** a failed fetch ends up in `error` as `Live2D: failed to fetch
  <url> (<status>)`. Network errors (e.g. offline) come through the same way;
  `retry()` tries again. URLs in error messages never include their query, so
  tokens don't leak into the UI or logs.

### Protected models

```tsx
// 1. A token in the query: reused for every file on the same host.
useLive2DModel('https://cdn.example.com/haru/haru.model3.json?token=abc');

// 2. Headers: sent with every request.
useLive2DModel(url, { headers: { Authorization: `Bearer ${token}` } });

// 3. A signature per file (e.g. S3 presigned URLs): sign each one yourself.
useLive2DModel(signedModel3Url, {
  resolveUrl: (url, file) => api.sign(url), // may return a promise
});
```

- **`resolveUrl(url, file)`:** `url` is the file resolved next to the
  `model3.json`, without a query, and `file` is the path as listed. When it's
  given, the `model3.json`'s query isn't copied.
- **Options are read once**, like the source, and `retry()` reuses them. To
  load with a fresh token, remount (e.g. change the component's `key`).
  `resolveUrl` itself runs on every load, so it can fetch fresh signatures.
- **Cubism 2 models** (`model.json`, `.moc`) can't be loaded: Cubism Core 5
  only reads `.moc3`.

## Several models in one canvas

```tsx
const gesture = useLive2DGestures([
  { model: hiyori, ...hiyoriPlace, onMove: (x, y) => moveHiyori(x, y) },
  { model: mao, ...maoPlace, onMove: (x, y) => moveMao(x, y) },
]);

<GestureDetector gesture={gesture}>
  <Canvas style={{ flex: 1 }}>
    <Rect … />                              {/* behind the models */}
    <Live2D model={hiyori} {...hiyoriPlace} />
    <Live2D model={mao} {...maoPlace} />
    <RoundedRect … />                       {/* over the models */}
  </Canvas>
</GestureDetector>
```

- Inside a `<Canvas>`, JSX order is drawing order: a `<Live2D>` is one layer
  among ordinary Skia shapes.
- One animation loop updates and draws every shown model each frame
  (`src/ticker.ts`). Two `<Live2D>`s showing the same model share its frames.
- The canvas is an ordinary view: size it with styles. Models are drawn at the
  `x`, `y`, `scale` they're given and clipped to the canvas, so fit them to the
  measured size (see `fit()` in `src/app/index.tsx`).

## Model methods

Points are in model pixels: the model's canvas at its native size
(`model.width` x `model.height`), origin top-left.

```ts
model.motion('TapBody');                 // random motion of a group
model.motion('TapBody', 0, 'force');     // given motion and priority (idle / normal / force)
model.expression('exp_01');              // expression; random without a name
model.resetExpression();
model.setParameter('ParamAngleX', 30);   // held over motions until resetParameter
model.resetParameter('ParamAngleX');
model.focus(x, y);                       // look at a point, easing
model.resetFocus();
model.hitTest(x, y);                     // → ['Head']
```

Methods can be called from the JS thread while the model animates on its
background thread: the native model is locked.

## `<Live2D />` props

| Prop | Description |
| --- | --- |
| `model` | `model` from `useLive2DModel` |
| `x`, `y` | Position on canvas |
| `scale` | Uniform scale |
| `paused` | Stops animating, keeps the current frame |
| `maxFps` | Caps the frame rate (e.g. 30 to save battery). Default: the display's refresh rate |
| `onFrameStats(stats)` | About once a second: fps, target fps, and per-frame times (`update`, copy, draw, mesh building), meshes rebuilt, mask layers, models in the loop and the whole loop's time |

## `useLive2DGestures(targets, options)`

Returns one gesture for a `<GestureDetector>` around the `<Canvas>`. Gestures
need a native view, so this can't be a prop of `<Live2D>`, which is drawn
inside the canvas. List targets in drawing order.

- A drag makes every model look at the finger.
- A tap goes to the topmost model with a hit area under it.
- A long press (350 ms) on a model's hit area picks it up, if it has `onMove`.

| Target field | Description |
| --- | --- |
| `model` | `model` from `useLive2DModel` |
| `x`, `y`, `scale` | Same as its `<Live2D>` props, to map touches to the model |
| `onHit(hitAreas)` | Called on a tap on its hit areas. Return `true` to skip the default: a random `Tap<Area>` motion (e.g. `TapBody`), or a random expression for `Head` without one, like the SDK sample; failing those, a random `Tap` motion (models with one tap group) |
| `onMove(x, y)` | Makes it draggable. Called with its new top-left position as the finger moves, keeping the point where it was grabbed; the app moves it |

| Option | Description |
| --- | --- |
| `focus` | Models follow the finger while it's down (default `true`) |

The gesture is built once; targets are read at touch time, so they can change
on every render.

## `useLive2DGesture(model, options)`

The same for one model: `options` is a target (without `model`) plus `focus`.

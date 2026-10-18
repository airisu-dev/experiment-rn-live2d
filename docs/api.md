# Public API (pixi-live2d style)

```tsx
// A require.context of the model's folder: the files its model3.json lists are
// loaded from it. Or pass the files yourself as a Live2DModelSource.
const model = useLive2DModel(require.context('./Mao', true, /\.(json|moc3|png)$/));
const gesture = useLive2DGesture(model, { x, y, scale });

<GestureDetector gesture={gesture}>
  <Canvas style={{ flex: 1 }}>
    <Live2D model={model} x={x} y={y} scale={scale} />
  </Canvas>
</GestureDetector>
```

The app needs a `GestureHandlerRootView` at its root.

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
| `model` | Model from `useLive2DModel` |
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
| `model` | Model from `useLive2DModel` |
| `x`, `y`, `scale` | Same as its `<Live2D>` props, to map touches to the model |
| `onHit(hitAreas)` | Called on a tap on its hit areas. Return `true` to skip the default: a random `Tap<Area>` motion (e.g. `TapBody`), or a random expression for `Head` without one, like the SDK sample |
| `onMove(x, y)` | Makes it draggable. Called with its new top-left position as the finger moves, keeping the point where it was grabbed; the app moves it |

| Option | Description |
| --- | --- |
| `focus` | Models follow the finger while it's down (default `true`) |

The gesture is built once; targets are read at touch time, so they can change
on every render.

## `useLive2DGesture(model, options)`

The same for one model: `options` is a target (without `model`) plus `focus`.

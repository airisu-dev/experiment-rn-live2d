import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BlurMask,
  Canvas,
  Circle,
  LinearGradient,
  Oval,
  Rect,
  RoundedRect,
  vec,
} from 'react-native-skia';
import {
  Live2D,
  useLive2DGesture,
  useLive2DGestures,
  useLive2DModel,
  type Live2DFrameStats,
  type Live2DModel,
  type Live2DModelContext,
} from 'rn-live2d';
import { MODEL_NAMES, MODELS, type ModelName } from '@/live2dModels';

// Each sample alone, or all of them side by side in one canvas.
type Choice = ModelName | 'All';
const CHOICES: Choice[] = [...MODEL_NAMES, 'All'];

export default function Home() {
  const [name, setName] = useState<Choice>('Hiyori');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.switcher}>
        {CHOICES.map((n) => (
          <Pressable
            key={n}
            onPress={() => setName(n)}
            style={[styles.option, n === name && styles.optionActive]}
          >
            <Text
              style={[styles.optionText, n === name && styles.optionTextActive]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      {/* useLive2DModel loads once per mount, so remount the view per model. */}
      {name === 'All' ? (
        <AllModelsView key={name} />
      ) : (
        <ModelView key={name} source={MODELS[name]} />
      )}
    </SafeAreaView>
  );
}

// Fits a model's canvas inside a box, centered.
function fit(
  model: Live2DModel | null,
  box: { x: number; y: number; width: number; height: number }
) {
  if (!model) return { x: 0, y: 0, scale: 1 };
  const scale = Math.min(box.width / model.width, box.height / model.height);
  return {
    x: box.x + (box.width - model.width * scale) / 2,
    y: box.y + (box.height - model.height * scale) / 2,
    scale,
  };
}

function offset(
  place: { x: number; y: number; scale: number },
  by: { x: number; y: number }
) {
  return { ...place, x: place.x + by.x, y: place.y + by.y };
}

function ModelView({ source }: { source: Live2DModelContext }) {
  const model = useLive2DModel(source);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [stats, setStats] = useState<Live2DFrameStats | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);
  // Where the model has been dragged to, relative to its fitted place.
  const [moved, setMoved] = useState({ x: 0, y: 0 });
  const fitted = fit(model, { x: 0, y: 0, ...size });
  const { x, y, scale } = offset(fitted, moved);
  // Follow the finger; tap the body (or Mao's head) to play a motion (or expression).
  // Long-press the model to drag it around.
  const gesture = useLive2DGesture(model, {
    x,
    y,
    scale,
    onMove: (nx, ny) => setMoved({ x: nx - fitted.x, y: ny - fitted.y }),
  });

  return (
    <View style={styles.modelView} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.canvas}>
          <Live2D
            model={model}
            x={x}
            y={y}
            scale={scale}
            onFrameStats={setStats}
          />
        </Canvas>
      </GestureDetector>
      {!model && <Text style={styles.loading}>Loading model…</Text>}
      {stats && <Text style={styles.stats}>{formatStats(stats)}</Text>}
    </View>
  );
}

// Every sample model in one canvas, side by side: one shared animation loop.
function AllModelsView() {
  const hiyori = useLive2DModel(MODELS.Hiyori);
  const mao = useLive2DModel(MODELS.Mao);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hiyoriStats, setHiyoriStats] = useState<Live2DFrameStats | null>(null);
  const [maoStats, setMaoStats] = useState<Live2DFrameStats | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  const half = size.width / 2;
  const hiyoriFitted = fit(hiyori, { x: 0, y: 0, width: half, height: size.height });
  const maoFitted = fit(mao, { x: half, y: 0, width: half, height: size.height });
  // Where each model has been dragged to, relative to its fitted place.
  const [hiyoriMoved, setHiyoriMoved] = useState({ x: 0, y: 0 });
  const [maoMoved, setMaoMoved] = useState({ x: 0, y: 0 });
  const left = offset(hiyoriFitted, hiyoriMoved);
  const right = offset(maoFitted, maoMoved);
  // One gesture for every model: a tap goes to the topmost model it hits.
  const gesture = useLive2DGestures([
    {
      model: hiyori,
      ...left,
      onMove: (x, y) => setHiyoriMoved({ x: x - hiyoriFitted.x, y: y - hiyoriFitted.y }),
    },
    {
      model: mao,
      ...right,
      onMove: (x, y) => setMaoMoved({ x: x - maoFitted.x, y: y - maoFitted.y }),
    },
  ]);

  return (
    <View style={styles.modelView} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.canvas}>
          {/* Behind the models: drawn first. */}
          <Rect x={0} y={0} width={size.width} height={size.height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, size.height)}
              colors={['#cfe8ff', '#fdf3ff', '#ffffff']}
            />
          </Rect>
          <Circle cx={size.width * 0.8} cy={size.height * 0.22} r={48} color="#ffe08a">
            <BlurMask blur={12} style="solid" />
          </Circle>
          <FloorShadow model={hiyori} place={left} />
          <FloorShadow model={mao} place={right} />

          <Live2D model={hiyori} {...left} onFrameStats={setHiyoriStats} />
          <Live2D model={mao} {...right} onFrameStats={setMaoStats} />

          {/* Over the models: drawn last. */}
          <RoundedRect
            x={16}
            y={size.height * 0.62}
            width={Math.max(0, size.width - 32)}
            height={56}
            r={16}
            color="rgba(32, 138, 239, 0.35)"
          />
          <Circle cx={size.width * 0.22} cy={size.height * 0.5} r={14} color="rgba(255, 255, 255, 0.7)" />
          <Circle cx={size.width * 0.5} cy={size.height * 0.45} r={9} color="rgba(255, 255, 255, 0.7)" />
          <Circle cx={size.width * 0.78} cy={size.height * 0.55} r={18} color="rgba(255, 255, 255, 0.7)" />
        </Canvas>
      </GestureDetector>
      {(!hiyori || !mao) && <Text style={styles.loading}>Loading models…</Text>}
      {hiyoriStats && maoStats && (
        <Text style={styles.stats}>
          {[
            `Hiyori ${formatShort(hiyoriStats)}`,
            `Mao    ${formatShort(maoStats)}`,
            `loop: ${maoStats.models} models · ${maoStats.loopWorkMs.toFixed(1)} ms per frame`,
          ].join('\n')}
        </Text>
      )}
    </View>
  );
}

// A soft ellipse under a model's feet. The models' canvases have some padding
// below the feet, so it sits a little above the bottom of the model's box.
function FloorShadow({
  model,
  place,
}: {
  model: Live2DModel | null;
  place: { x: number; y: number; scale: number };
}) {
  if (!model) return null;
  const width = model.width * place.scale;
  const height = model.height * place.scale;
  return (
    <Oval
      x={place.x + width * 0.3}
      y={place.y + height * 0.9}
      width={width * 0.4}
      height={height * 0.04}
      color="rgba(40, 50, 80, 0.25)"
    >
      <BlurMask blur={6} style="normal" />
    </Oval>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  switcher: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 8,
    padding: 4,
    borderRadius: 999,
    backgroundColor: '#eef1f5',
  },
  option: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 999 },
  optionActive: { backgroundColor: '#208AEF' },
  optionText: { fontSize: 15, fontWeight: '600', color: '#4a5563' },
  optionTextActive: { color: '#fff' },
  modelView: { flex: 1 },
  canvas: { flex: 1 },
  loading: { position: 'absolute', alignSelf: 'center', top: '50%' },
  stats: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#4a5563',
  },
});

// Animation loop timings, per frame, for checking performance on a device.
function formatStats(s: Live2DFrameStats) {
  const ms = (v: number) => v.toFixed(1);
  return [
    `${s.fps.toFixed(0)}/${s.targetFps.toFixed(0)} fps · work ${ms(s.workMs)} ms`,
    `update ${ms(s.updateMs)} · copy ${ms(s.drawablesMs)} · draw ${ms(s.drawMs)} (mesh ${ms(s.meshMs)})`,
    `meshes ${s.meshesBuilt.toFixed(0)} · layers ${s.layers.toFixed(0)}`,
  ].join('\n');
}

function formatShort(s: Live2DFrameStats) {
  return `${s.fps.toFixed(0)}/${s.targetFps.toFixed(0)} fps · work ${s.workMs.toFixed(1)} ms`;
}

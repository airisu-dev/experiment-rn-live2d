import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Canvas } from 'react-native-skia';
import { Live2D, useLive2DModel } from 'rn-live2d';

export default function Home() {
  const model = useLive2DModel({
    moc: require('@/assets/live2d/Hiyori/Hiyori.moc3'),
    textures: [
      require('@/assets/live2d/Hiyori/Hiyori.2048/texture_00.png'),
      require('@/assets/live2d/Hiyori/Hiyori.2048/texture_01.png'),
    ],
  });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  // Fit the model's canvas inside the view, centered.
  const scale = model
    ? Math.min(size.width / model.width, size.height / model.height)
    : 1;
  const x = model ? (size.width - model.width * scale) / 2 : 0;
  const y = model ? (size.height - model.height * scale) / 2 : 0;

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Canvas style={styles.canvas}>
        <Live2D model={model} x={x} y={y} scale={scale} />
      </Canvas>
      {!model && <Text style={styles.loading}>Loading model…</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  canvas: { flex: 1 },
  loading: { position: 'absolute', alignSelf: 'center', top: '50%' },
});

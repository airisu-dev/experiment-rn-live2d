import { Canvas, Circle } from 'react-native-skia';
import { RnLive2d } from 'rn-live2d';
import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  const sum = RnLive2d.sum(1, 2);
  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        <Circle cx={120} cy={120} r={80} color="#6ac" />
      </Canvas>
      <Text style={styles.text}>Nitro sum(1, 2) = {sum}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvas: { width: 240, height: 240 },
  text: { marginTop: 16, fontSize: 16 },
});

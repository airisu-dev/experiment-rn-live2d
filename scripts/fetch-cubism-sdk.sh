#!/usr/bin/env bash
# Downloads Cubism SDK for Native from Live2D into the demo app's gitignored
# apps/app/vendor/CubismSdkForNative/ folder (its cubismSdkPath in app.json), and
# copies the sample models the shared demo uses into packages/demo/assets/live2d/.
#
# The SDK's Core is proprietary and is never committed (see docs/gotchas.md#licensing).
# Running this means accepting Live2D's license terms, included in the SDK as LICENSE.md.
# The SDK version and checksum are in packages/rn-live2d/package.json (cubismSdk).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/app"
SDK_DIR="$APP/vendor/CubismSdkForNative"
SAMPLES=(Hiyori Mao)

# The CLI is built by the repo's postinstall, so install dependencies first.
# --keep-zip: CI caches the zip.
node "$ROOT/packages/rn-live2d/cli/build/index.js" fetch-sdk --accept-license --out "$SDK_DIR" --keep-zip

for name in "${SAMPLES[@]}"; do
  dest="$ROOT/packages/demo/assets/live2d/$name"
  if [ ! -d "$dest" ]; then
    mkdir -p "$ROOT/packages/demo/assets/live2d"
    cp -R "$SDK_DIR/Samples/Resources/$name" "$dest"
    echo "Copied sample model $name to $dest"
  fi
done

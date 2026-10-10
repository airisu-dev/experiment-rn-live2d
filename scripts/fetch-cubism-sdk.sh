#!/usr/bin/env bash
# Downloads Cubism SDK for Native from Live2D into the gitignored vendor folder,
# and copies the sample model the example app uses into assets/live2d/.
#
# The SDK's Core is proprietary and is never committed (see docs/gotchas.md#licensing).
# Running this means accepting Live2D's license terms, included in the SDK as LICENSE.md.
set -euo pipefail

VERSION="5-r.5"
SHA256="7ff3a4bbc19c0a8728965aa522ab77eb11b252916453e68a8a78d3b71188bb12"
URL="https://cubism.live2d.com/sdk-native/bin/CubismSdkForNative-${VERSION}.zip"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT/packages/rn-live2d/vendor"
SDK_DIR="$VENDOR_DIR/CubismSdkForNative"
ZIP="$VENDOR_DIR/CubismSdkForNative-${VERSION}.zip"
SAMPLES=(Hiyori)

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

mkdir -p "$VENDOR_DIR"

if [ -f "$SDK_DIR/.version" ] && [ "$(cat "$SDK_DIR/.version")" = "$VERSION" ]; then
  echo "Cubism SDK $VERSION already in $SDK_DIR"
else
  if [ ! -f "$ZIP" ] || [ "$(sha256 "$ZIP")" != "$SHA256" ]; then
    echo "Downloading $URL"
    curl -fsSL --retry 3 -o "$ZIP" "$URL"
  fi
  actual="$(sha256 "$ZIP")"
  if [ "$actual" != "$SHA256" ]; then
    echo "error: checksum mismatch for $ZIP (expected $SHA256, got $actual)" >&2
    rm -f "$ZIP"
    exit 1
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  unzip -q "$ZIP" -d "$tmp"
  rm -rf "$SDK_DIR"
  mv "$tmp/CubismSdkForNative-${VERSION}" "$SDK_DIR"
  echo "$VERSION" > "$SDK_DIR/.version"
  echo "Extracted Cubism SDK $VERSION to $SDK_DIR"
fi

# iOS: the SDK ships one static library per slice. Package them as an xcframework so
# CocoaPods picks the right one for device or simulator. Needs Xcode, so macOS only.
XCFRAMEWORK="$SDK_DIR/Core/Live2DCubismCore.xcframework"
if [ "$(uname)" = "Darwin" ] && [ ! -d "$XCFRAMEWORK" ]; then
  lib="$SDK_DIR/Core/lib/ios"
  sim="$(mktemp -d)"
  lipo -create \
    "$lib/Release-iphonesimulator-arm64/libLive2DCubismCore.a" \
    "$lib/Release-iphonesimulator-x86_64/libLive2DCubismCore.a" \
    -output "$sim/libLive2DCubismCore.a"
  xcodebuild -create-xcframework \
    -library "$lib/Release-iphoneos/libLive2DCubismCore.a" -headers "$SDK_DIR/Core/include" \
    -library "$sim/libLive2DCubismCore.a" -headers "$SDK_DIR/Core/include" \
    -output "$XCFRAMEWORK"
  rm -rf "$sim"
  echo "Created $XCFRAMEWORK"
fi

for name in "${SAMPLES[@]}"; do
  dest="$ROOT/assets/live2d/$name"
  if [ ! -d "$dest" ]; then
    mkdir -p "$ROOT/assets/live2d"
    cp -R "$SDK_DIR/Samples/Resources/$name" "$dest"
    echo "Copied sample model $name to $dest"
  fi
done

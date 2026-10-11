require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Cubism Core is proprietary and user-supplied (see docs/gotchas.md#licensing).
# scripts/fetch-cubism-sdk.sh downloads the SDK and builds the xcframework on macOS.
cubism_core_dir = File.join(__dir__, "vendor", "CubismSdkForNative", "Core")
unless File.directory?(File.join(cubism_core_dir, "Live2DCubismCore.xcframework"))
  raise "[RnLive2d] Cubism Core xcframework not found in #{cubism_core_dir}. " \
        "Run `bun run fetch:cubism` on macOS first."
end

# Cubism Native Framework: git submodule, pinned to the tag matching the Core version.
cubism_framework_dir = File.join(__dir__, "third_party", "CubismNativeFramework", "src")
unless File.file?(File.join(cubism_framework_dir, "CubismFramework.cpp"))
  raise "[RnLive2d] Cubism Native Framework not found in #{cubism_framework_dir}. " \
        "Run `git submodule update --init`."
end

# Draw in C++ onto react-native-skia canvases (cpp/SkiaDrawer.cpp). Skia is
# linked statically into the app by the react-native-skia pod, so this only needs
# its headers and the defines it's built with. Without it, models are drawn in JS.
rn_skia_dir = Dir.chdir(__dir__) do
  `node -e "process.stdout.write(require('path').dirname(require.resolve('react-native-skia/package.json')))" 2>/dev/null`.strip
end
rn_skia_dir = nil if rn_skia_dir.empty? || !File.file?(File.join(rn_skia_dir, "cpp", "api", "JsiSkCanvas.h"))

Pod::Spec.new do |s|
  s.name         = "RnLive2d"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/airisu-dev/experiment-rn-live2d.git", :tag => "#{s.version}" }

  s.source_files = [
    # Implementation (Swift)
    "ios/**/*.{swift}",
    # Autolinking/Registration (Objective-C++)
    "ios/**/*.{m,mm}",
    # Implementation (C++ objects)
    "cpp/**/*.{hpp,cpp}",
    # Cubism Native Framework (motions, physics, pose, ...)
    "third_party/CubismNativeFramework/src/**/*.{hpp,cpp}",
  ]
  # Its Rendering/<backend> folders are left out: we draw with Skia
  # (see cpp/CubismRendererStub.cpp).
  s.exclude_files = "third_party/CubismNativeFramework/src/Rendering/*/**/*"

  s.vendored_frameworks = "vendor/CubismSdkForNative/Core/Live2DCubismCore.xcframework"
  # Set before add_nitrogen_files, which merges its own settings into this.
  header_search_paths = [
    "\"$(PODS_TARGET_SRCROOT)/vendor/CubismSdkForNative/Core/include\"",
    "\"$(PODS_TARGET_SRCROOT)/third_party/CubismNativeFramework/src\"",
  ]
  preprocessor_definitions = ["$(inherited)"]
  if rn_skia_dir
    Pod::UI.puts "[RnLive2d] Drawing with Skia in C++ (#{rn_skia_dir})"
    s.dependency "react-native-skia"
    header_search_paths += ["cpp", "cpp/skia", "cpp/dawn/include", "cpp/api", "cpp/jsi",
                            "cpp/rnskia", "cpp/rnskia/values", "cpp/utils"]
      .map { |dir| "\"#{File.join(rn_skia_dir, dir)}\"" }
    # Same as the react-native-skia pod: struct layouts must match.
    preprocessor_definitions += ["RN_LIVE2D_SKIA=1", "SK_GRAPHITE=1",
                                 "SK_IMAGE_READ_PIXELS_DISABLE_LEGACY_API=1",
                                 "SK_DISABLE_LEGACY_SHAPER_FACTORY=1"]
  else
    Pod::UI.puts "[RnLive2d] react-native-skia not found, drawing in JS"
  end
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => header_search_paths.join(" "),
    "GCC_PREPROCESSOR_DEFINITIONS" => preprocessor_definitions.join(" "),
  }

  load 'nitrogen/generated/ios/RnLive2d+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end

project(RnLive2d)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME RnLive2d)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# Enable Raw Props parsing in react-native (for Nitro Views)
add_compile_options(-DRN_SERIALIZABLE_STATE=1)

# Cubism SDK for Native: proprietary, downloaded by each app. build.gradle
# passes its folder (and checks its version), see app.plugin.js.
if (NOT CUBISM_SDK_DIR)
        message(FATAL_ERROR "[rn-live2d] CUBISM_SDK_DIR isn't set: build through Gradle, "
                "with rnLive2d.cubismSdkPath set by the rn-live2d config plugin.")
endif()

# Cubism Core (closed source): the prebuilt static library.
set (CUBISM_CORE_DIR "${CUBISM_SDK_DIR}/Core")
set (CUBISM_CORE_LIB "${CUBISM_CORE_DIR}/lib/android/${ANDROID_ABI}/libLive2DCubismCore.a")
if (NOT EXISTS "${CUBISM_CORE_LIB}")
        message(FATAL_ERROR "[rn-live2d] Cubism Core not found for ${ANDROID_ABI} at ${CUBISM_CORE_LIB}.")
endif()
add_library(Live2DCubismCore STATIC IMPORTED)
set_target_properties(Live2DCubismCore PROPERTIES IMPORTED_LOCATION "${CUBISM_CORE_LIB}")

# Cubism Native Framework (motions, physics, pose, ...): the source in the same
# SDK, so it always matches the Core.
# Its Rendering/<backend> folders are left out: we draw with Skia
# (see ../cpp/CubismRendererStub.cpp).
set (CUBISM_FRAMEWORK_DIR "${CUBISM_SDK_DIR}/Framework/src")
if (NOT EXISTS "${CUBISM_FRAMEWORK_DIR}/CubismFramework.cpp")
        message(FATAL_ERROR "[rn-live2d] Cubism Native Framework not found at ${CUBISM_FRAMEWORK_DIR}.")
endif()
file(GLOB_RECURSE CUBISM_FRAMEWORK_SOURCES "${CUBISM_FRAMEWORK_DIR}/*.cpp")
list(FILTER CUBISM_FRAMEWORK_SOURCES EXCLUDE REGEX "/Rendering/[^/]+/")
add_library(CubismFramework STATIC ${CUBISM_FRAMEWORK_SOURCES})
target_include_directories(CubismFramework PUBLIC "${CUBISM_FRAMEWORK_DIR}" "${CUBISM_CORE_DIR}/include")
# Third-party code: don't flood the build log with its warnings.
target_compile_options(CubismFramework PRIVATE -w)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
	src/main/cpp/cpp-adapter.cpp
	../cpp/HybridRnLive2d.cpp
	../cpp/HybridLive2DModel.cpp
	../cpp/CubismSetup.cpp
	../cpp/CubismRendererStub.cpp
	../cpp/Live2DUserModel.cpp
)

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/RnLive2d+autolinking.cmake)

# Set up local includes
include_directories(
        "src/main/cpp"
        "../cpp"
        "${CUBISM_CORE_DIR}/include"
)

# Draw in C++ onto Skia canvases (cpp/SkiaDrawer.cpp). librnskia.so doesn't
# export Skia, so link the same prebuilt libskia.a it's built from and use its
# headers and defines; objects cross over through virtual calls. build.gradle
# passes the folders of the Skia the app uses, v3 (Graphite) or v2 (Ganesh).
# Without them, models are drawn in JS (src/drawer.ts).
set (RN_SKIA_LIBS_ABI "${RN_SKIA_LIBS}/${ANDROID_ABI}")
if (RN_SKIA_DIR AND EXISTS "${RN_SKIA_LIBS_ABI}/libskia.a" AND EXISTS "${RN_SKIA_DIR}/cpp/api/JsiSkCanvas.h")
        message(STATUS "rn-live2d: drawing with Skia in C++ (${RN_SKIA_DIR}, Graphite: ${RN_SKIA_GRAPHITE})")
        add_library(skia STATIC IMPORTED)
        set_target_properties(skia PROPERTIES IMPORTED_LOCATION "${RN_SKIA_LIBS_ABI}/libskia.a")
        target_sources(${PACKAGE_NAME} PRIVATE ../cpp/SkiaDrawer.cpp)
        target_include_directories(${PACKAGE_NAME} PRIVATE
                "${RN_SKIA_DIR}/cpp/skia"
                "${RN_SKIA_DIR}/cpp/api"
                "${RN_SKIA_DIR}/cpp/jsi"
                "${RN_SKIA_DIR}/cpp/rnskia"
                "${RN_SKIA_DIR}/cpp/rnskia/values"
                "${RN_SKIA_DIR}/cpp/utils"
                "${RN_SKIA_DIR}/cpp"
                "${RN_SKIA_DIR}/android/cpp/rnskia-android"
                "${RN_SKIA_DIR}/android/cpp/jni/include"
                "${REACT_NATIVE_DIR}/ReactCommon"
                "${REACT_NATIVE_DIR}/ReactCommon/callinvoker")
        # Same as the Skia package's build: struct layouts must match.
        target_compile_definitions(${PACKAGE_NAME} PRIVATE
                RN_LIVE2D_SKIA=1 SK_BUILD_FOR_ANDROID
                SK_DISABLE_LEGACY_SHAPER_FACTORY SK_IMAGE_READ_PIXELS_DISABLE_LEGACY_API
                FOLLY_NO_CONFIG=1 FOLLY_HAVE_CLOCK_GETTIME=1 FOLLY_HAVE_MEMRCHR=1
                FOLLY_USE_LIBCPP=1 FOLLY_MOBILE=1 ON_ANDROID ONANDROID)
        if (RN_SKIA_GRAPHITE)
                target_include_directories(${PACKAGE_NAME} PRIVATE "${RN_SKIA_DIR}/cpp/dawn/include")
                target_compile_definitions(${PACKAGE_NAME} PRIVATE SK_GRAPHITE)
        else()
                target_compile_definitions(${PACKAGE_NAME} PRIVATE SK_GL SK_GANESH)
        endif()
        set (RN_LIVE2D_SKIA_LIBS skia)
else()
        message(STATUS "rn-live2d: no Skia to draw with in C++, drawing in JS")
endif()

find_library(LOG_LIB log)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        CubismFramework
        Live2DCubismCore
        ${RN_LIVE2D_SKIA_LIBS}
        android                                   # <-- Android core
)

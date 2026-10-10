project(RnLive2d)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME RnLive2d)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# Enable Raw Props parsing in react-native (for Nitro Views)
add_compile_options(-DRN_SERIALIZABLE_STATE=1)

# Cubism Core is proprietary and user-supplied (see docs/gotchas.md#licensing).
# Override with -DCUBISM_CORE_DIR=<path to SDK's Core folder>.
if (NOT CUBISM_CORE_DIR)
        set (CUBISM_CORE_DIR "${CMAKE_SOURCE_DIR}/../vendor/CubismSdkForNative/Core")
endif()
set (CUBISM_CORE_LIB "${CUBISM_CORE_DIR}/lib/android/${ANDROID_ABI}/libLive2DCubismCore.a")
if (NOT EXISTS "${CUBISM_CORE_LIB}")
        message(FATAL_ERROR "Cubism Core not found for ${ANDROID_ABI} at ${CUBISM_CORE_LIB}. "
                "Download Cubism SDK for Native and extract it to packages/rn-live2d/vendor/CubismSdkForNative.")
endif()
add_library(Live2DCubismCore STATIC IMPORTED)
set_target_properties(Live2DCubismCore PROPERTIES IMPORTED_LOCATION "${CUBISM_CORE_LIB}")

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
	src/main/cpp/cpp-adapter.cpp
	../cpp/HybridRnLive2d.cpp
	../cpp/HybridLive2DModel.cpp
)

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/RnLive2d+autolinking.cmake)

# Set up local includes
include_directories(
        "src/main/cpp"
        "../cpp"
        "${CUBISM_CORE_DIR}/include"
)

find_library(LOG_LIB log)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        Live2DCubismCore
        android                                   # <-- Android core
)

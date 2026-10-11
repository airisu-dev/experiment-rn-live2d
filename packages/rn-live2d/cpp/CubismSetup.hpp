#pragma once

namespace margelo::nitro::rnlive2d {

// Starts up and initializes the Cubism Framework once per process.
// Safe to call from any thread, any number of times.
void ensureCubismFramework();

} // namespace margelo::nitro::rnlive2d

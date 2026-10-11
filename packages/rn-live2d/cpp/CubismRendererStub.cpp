// The Cubism Framework references a few renderer entry points that each
// Rendering/<backend> normally defines. We draw with Skia instead, so no
// backend is compiled and these are stubbed out.
#include "Rendering/CubismRenderer.hpp"

namespace Live2D::Cubism::Framework::Rendering {

CubismRenderer* CubismRenderer::Create(csmUint32, csmUint32) {
    return nullptr;
}

void CubismRenderer::StaticRelease() {}

} // namespace Live2D::Cubism::Framework::Rendering

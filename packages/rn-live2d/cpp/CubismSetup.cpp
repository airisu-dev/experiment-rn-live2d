#include "CubismSetup.hpp"
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include "CubismFramework.hpp"
#include "ICubismAllocator.hpp"

#ifdef __ANDROID__
#include <android/log.h>
#endif

namespace margelo::nitro::rnlive2d {

namespace {

using namespace Live2D::Cubism::Framework;

class Allocator : public ICubismAllocator {
    public:
        void* Allocate(const csmSizeType size) override { return std::malloc(size); }
        void Deallocate(void* memory) override { std::free(memory); }
        void* AllocateAligned(const csmSizeType size, const csmUint32 alignment) override {
            void* p = nullptr;
            // posix_memalign needs at least pointer alignment.
            const size_t a = alignment < sizeof(void*) ? sizeof(void*) : alignment;
            return posix_memalign(&p, a, size) == 0 ? p : nullptr;
        }
        void DeallocateAligned(void* alignedMemory) override { std::free(alignedMemory); }
};

void log(const char* message) {
#ifdef __ANDROID__
    __android_log_print(ANDROID_LOG_INFO, "RnLive2d", "%s", message);
#else
    std::printf("[RnLive2d] %s", message);
#endif
}

} // namespace

void ensureCubismFramework() {
    static std::once_flag once;
    std::call_once(once, [] {
        // Both live for the whole process: the Framework keeps pointers to them.
        static Allocator allocator;
        static CubismFramework::Option option{};
        option.LogFunction = log;
        option.LoggingLevel = CubismFramework::Option::LogLevel_Info;
        CubismFramework::StartUp(&allocator, &option);
        CubismFramework::Initialize();
    });
}

} // namespace margelo::nitro::rnlive2d

#pragma once
#include <map>
#include <string>
#include "CubismModelSettingJson.hpp"
#include "Model/CubismUserModel.hpp"

namespace margelo::nitro::rnlive2d {

namespace csm = Live2D::Cubism::Framework;

// Drives a model with the Cubism Framework, like the SDK sample's LAppModel,
// without its renderer: drawing is done with Skia from the drawable data.
// Never call CreateRenderer() on it (see CubismRendererStub.cpp).
class Live2DUserModel : public csm::CubismUserModel {
    public:
        enum Priority { PriorityIdle = 1, PriorityNormal = 2, PriorityForce = 3 };

        // Throws std::runtime_error if the moc or the settings can't be loaded.
        Live2DUserModel(const uint8_t* moc, size_t mocSize, const std::string& settingsJson);
        ~Live2DUserModel() override;

        csm::CubismModel* model() const { return _model; }

        void loadPhysics(const std::string& json);
        void loadPose(const std::string& json);
        void loadMotion(const std::string& group, int index, const std::string& json);
        bool startMotion(const std::string& group, int index, Priority priority);
        void update(float deltaSeconds);

    private:
        static std::string motionKey(const std::string& group, int index);
        bool startRandomMotion(const std::string& group, Priority priority);

        csm::CubismModelSettingJson* _setting = nullptr;
        csm::csmVector<csm::CubismIdHandle> _eyeBlinkIds;
        csm::csmVector<csm::CubismIdHandle> _lipSyncIds;
        std::map<std::string, csm::ACubismMotion*> _motions;
        // Read by the eye blink updater: no blinking while a motion moves the eyes.
        csm::csmBool _motionUpdated = false;
};

} // namespace margelo::nitro::rnlive2d

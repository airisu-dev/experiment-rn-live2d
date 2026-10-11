#include "Live2DUserModel.hpp"
#include <cstdlib>
#include <stdexcept>
#include "CubismDefaultParameterId.hpp"
#include "Effect/CubismBreath.hpp"
#include "Effect/CubismEyeBlink.hpp"
#include "Id/CubismIdManager.hpp"
#include "Motion/CubismBreathUpdater.hpp"
#include "Motion/CubismEyeBlinkUpdater.hpp"
#include "Motion/CubismMotion.hpp"
#include "Motion/CubismPhysicsUpdater.hpp"
#include "Motion/CubismPoseUpdater.hpp"
#include "Utils/CubismJson.hpp"

namespace margelo::nitro::rnlive2d {

using namespace Live2D::Cubism::Framework;

namespace {

const csmByte* bytesOf(const std::string& s) {
    return reinterpret_cast<const csmByte*>(s.data());
}

// The Framework's loaders don't check for parse errors and crash on invalid
// JSON, so parse it once up front and throw instead.
void requireValidJson(const std::string& json, const std::string& what) {
    Utils::CubismJson* parsed = Utils::CubismJson::Create(bytesOf(json), static_cast<csmSizeInt>(json.size()));
    if (!parsed) throw std::runtime_error("Live2D: invalid " + what);
    Utils::CubismJson::Delete(parsed);
}

CubismIdHandle idOf(const csmChar* name) {
    return CubismFramework::GetIdManager()->GetId(name);
}

} // namespace

Live2DUserModel::Live2DUserModel(const uint8_t* moc, size_t mocSize, const std::string& settingsJson) {
    if (moc == nullptr || mocSize == 0) {
        throw std::runtime_error("Live2D: moc is empty");
    }
    LoadModel(moc, static_cast<csmSizeInt>(mocSize), true);
    if (_model == nullptr) {
        throw std::runtime_error("Live2D: moc is invalid, corrupted or newer than this Cubism Core");
    }

    requireValidJson(settingsJson, "model3.json");
    _setting = CSM_NEW CubismModelSettingJson(bytesOf(settingsJson), static_cast<csmSizeInt>(settingsJson.size()));

    for (csmInt32 i = 0; i < _setting->GetEyeBlinkParameterCount(); ++i) {
        _eyeBlinkIds.PushBack(_setting->GetEyeBlinkParameterId(i));
    }
    for (csmInt32 i = 0; i < _setting->GetLipSyncParameterCount(); ++i) {
        _lipSyncIds.PushBack(_setting->GetLipSyncParameterId(i));
    }

    if (_eyeBlinkIds.GetSize() > 0) {
        _eyeBlink = CubismEyeBlink::Create(_setting);
        _updateScheduler.AddUpdatableList(CSM_NEW CubismEyeBlinkUpdater(_motionUpdated, *_eyeBlink));
    }

    // Same breathing as the SDK samples.
    _breath = CubismBreath::Create();
    csmVector<CubismBreath::BreathParameterData> breath;
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamAngleX), 0.0f, 15.0f, 6.5345f, 0.5f));
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamAngleY), 0.0f, 8.0f, 3.5345f, 0.5f));
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamAngleZ), 0.0f, 10.0f, 5.5345f, 0.5f));
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamBodyAngleX), 0.0f, 4.0f, 15.5345f, 0.5f));
    breath.PushBack(CubismBreath::BreathParameterData(idOf(DefaultParameterId::ParamBreath), 0.5f, 0.5f, 3.2345f, 0.5f));
    _breath->SetParameters(breath);
    _updateScheduler.AddUpdatableList(CSM_NEW CubismBreathUpdater(*_breath));

    _updateScheduler.SortUpdatableList();
    _model->SaveParameters();
}

Live2DUserModel::~Live2DUserModel() {
    // Stop motions before deleting them: the motion manager still points at them.
    if (_motionManager) _motionManager->StopAllMotions();
    for (auto& [_, motion] : _motions) {
        ACubismMotion::Delete(motion);
    }
    CSM_DELETE(_setting);
}

void Live2DUserModel::loadPhysics(const std::string& json) {
    if (_physics) throw std::runtime_error("Live2D: physics already loaded");
    requireValidJson(json, "physics3.json");
    LoadPhysics(bytesOf(json), static_cast<csmSizeInt>(json.size()));
    if (!_physics) throw std::runtime_error("Live2D: invalid physics3.json");
    _updateScheduler.AddUpdatableList(CSM_NEW CubismPhysicsUpdater(*_physics));
    _updateScheduler.SortUpdatableList();
}

void Live2DUserModel::loadPose(const std::string& json) {
    if (_pose) throw std::runtime_error("Live2D: pose already loaded");
    requireValidJson(json, "pose3.json");
    LoadPose(bytesOf(json), static_cast<csmSizeInt>(json.size()));
    if (!_pose) throw std::runtime_error("Live2D: invalid pose3.json");
    _updateScheduler.AddUpdatableList(CSM_NEW CubismPoseUpdater(*_pose));
    _updateScheduler.SortUpdatableList();
}

void Live2DUserModel::loadMotion(const std::string& group, int index, const std::string& json) {
    const std::string key = motionKey(group, index);
    requireValidJson(json, "motion3.json for " + key);
    auto* motion = static_cast<CubismMotion*>(LoadMotion(
        bytesOf(json), static_cast<csmSizeInt>(json.size()), key.c_str(),
        nullptr, nullptr, _setting, group.c_str(), index));
    if (!motion) throw std::runtime_error("Live2D: invalid motion3.json for " + key);
    motion->SetEffectIds(_eyeBlinkIds, _lipSyncIds);

    auto it = _motions.find(key);
    if (it != _motions.end()) {
        _motionManager->StopAllMotions();
        ACubismMotion::Delete(it->second);
    }
    _motions[key] = motion;
}

bool Live2DUserModel::startMotion(const std::string& group, int index, Priority priority) {
    auto it = _motions.find(motionKey(group, index));
    if (it == _motions.end()) return false;

    if (priority == PriorityForce) {
        _motionManager->SetReservePriority(priority);
    } else if (!_motionManager->ReserveMotion(priority)) {
        return false;
    }
    // autoDelete = false: the motion is reused, and freed in the destructor.
    _motionManager->StartMotionPriority(it->second, false, priority);
    return true;
}

bool Live2DUserModel::startRandomMotion(const std::string& group, Priority priority) {
    int count = 0;
    while (_motions.count(motionKey(group, count))) ++count;
    if (count == 0) return false;
    return startMotion(group, std::rand() % count, priority);
}

void Live2DUserModel::update(float deltaSeconds) {
    // Same order as the SDK sample's LAppModel::Update.
    _motionUpdated = false;
    _model->LoadParameters();
    if (_motionManager->IsFinished()) {
        startRandomMotion("Idle", PriorityIdle);
    } else {
        _motionUpdated = _motionManager->UpdateMotion(_model, deltaSeconds);
    }
    _model->SaveParameters();

    // Eye blink (unless a motion moved the eyes), breath, physics, pose.
    _updateScheduler.OnLateUpdate(_model, deltaSeconds);
    _model->Update();
}

std::string Live2DUserModel::motionKey(const std::string& group, int index) {
    return group + "_" + std::to_string(index);
}

} // namespace margelo::nitro::rnlive2d

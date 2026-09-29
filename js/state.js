/**
 * userState - 계산기 전역에서 공유하는 사용자 입력 상태 객체
 * ----------------------------------------------------------------------
 * preset.js가 이 객체를 통째로 저장/복원합니다.
 * 다른 입력값(캐릭터 스탯, 장비 등)도 앞으로 이 객체에 필드를 추가해 나가면 됩니다.
 * ----------------------------------------------------------------------
 */
const USER_STATE_STORAGE_KEY = "cathero_user_state";

const userState = {
    equippedMainRunes: [null, null, null, null], // 메인 특수 룬 - 최대 4슬롯 (값: rune.image 문자열 또는 null)
    equippedSubRunes: [null, null, null, null, null, null], // 서브 룬 - 최대 6슬롯
    equippedCompanions: [null, null, null, null, null, null], // 동료 - 최대 6슬롯 (값: companion.image 문자열 또는 null) [슬롯 수는 임시값, 알려주시면 바로 수정 가능]
    equippedSkills: [null, null, null, null, null, null], // 스킬 - 최대 6슬롯 (값: skill.image 문자열 또는 null)
};

function saveUserState() {
    try {
        localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify(userState));
    } catch (e) { /* localStorage 사용 불가 환경은 무시 */ }
}

function loadUserState() {
    try {
        const saved = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY));
        if (saved && typeof saved === "object") {
            if (Array.isArray(saved.equippedMainRunes)) userState.equippedMainRunes = normalizeSlots(saved.equippedMainRunes, 4);
            if (Array.isArray(saved.equippedSubRunes)) userState.equippedSubRunes = normalizeSlots(saved.equippedSubRunes, 6);
            if (Array.isArray(saved.equippedCompanions)) userState.equippedCompanions = normalizeSlots(saved.equippedCompanions, 6);
            if (Array.isArray(saved.equippedSkills)) userState.equippedSkills = normalizeSlots(saved.equippedSkills, 6);
        }
    } catch (e) { /* 무시 */ }
}

// 슬롯 배열 길이를 강제로 맞춰줌 (저장된 데이터가 예전 버전이라 길이가 달라도 안전하게 처리)
function normalizeSlots(arr, size) {
    const out = arr.slice(0, size);
    while (out.length < size) out.push(null);
    return out;
}

loadUserState();
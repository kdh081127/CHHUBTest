/**
 * skills.js - 스킬 데이터 로딩 전용
 * ----------------------------------------------------------------------
 * companion.js / rune.js와 동일한 관례: skills.json을 불러와 전역
 * skillData 배열에 담아두기만 합니다. 실제 장착 UI는 skill-equip.js가 그립니다.
 * ----------------------------------------------------------------------
 */
let skillData = [];

// 등급 표기용 매핑 (rune.js의 RUNE_GRADE_NAMES와 동일한 체계)
const SKILL_GRADE_NAMES = {
    common: "일반",
    uncommon: "언커먼",
    rare: "레어",
    epic: "에픽",
    legendary: "전설",
    mythic: "신화",
};

/* ==========================================================================
   스킬 데이터 불러오기 (skills.json)
   ========================================================================== */
async function fetchSkills() {
    // 다른 데이터 파일들(companion.json 등)과의 관례를 따라 data/ 폴더를 먼저 시도하고,
    // 없으면 루트 경로(skills.json)도 시도합니다.
    const candidatePaths = ['data/skills.json', 'skills.json'];
    let lastError = null;

    for (const path of candidatePaths) {
        try {
            const res = await fetch(path);
            if (!res.ok) {
                lastError = new Error(`${path} 요청 실패 (status ${res.status})`);
                continue;
            }
            const data = await res.json();
            if (!Array.isArray(data)) {
                lastError = new Error(`${path}가 배열 형식이 아닙니다.`);
                continue;
            }
            console.log(`[skills.js] ${path} 에서 로드 성공`);
            return data;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('skills.json을 찾을 수 없습니다.');
}

async function loadSkillDB() {
    try {
        skillData = await fetchSkills();
        console.log(`[skills.js] 스킬 데이터 로드 완료: ${skillData.length}개`);
        document.dispatchEvent(new CustomEvent("skillDataLoaded"));
    } catch (err) {
        console.error("[skills.js] 스킬 데이터 로드 실패:", err);
    }
}

// 스킬의 고유 식별자 (image 경로를 키로 사용 - 룬/동료와 동일한 관례)
function skillKey(skill) {
    return skill.image;
}

// type 필드가 문자열이든 배열이든 안전하게 태그 배열로 변환
function skillTypeTags(skill) {
    const raw = skill && skill.type;
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === "string" && raw.trim()) return [raw.trim()];
    return [];
}

function isUniqueSkill(skill) {
    return skillTypeTags(skill).includes("고유");
}

// 페이지 로드 시 스킬 데이터 로드
document.addEventListener("DOMContentLoaded", loadSkillDB);
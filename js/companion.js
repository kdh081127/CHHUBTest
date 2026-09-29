/**
 * companion.js - 동료 데이터 로딩 전용
 * ----------------------------------------------------------------------
 * 예전에는 이 파일이 "동료 도감" 갤러리 페이지(카드 리스트 + 상세 모달)도
 * 함께 그렸지만, 도감 페이지를 없애고 덱 구성 추천 기능으로 통합하면서
 * 갤러리 렌더링 코드는 제거했습니다.
 *
 * 이 파일은 이제 companion.json을 불러와 전역 companionData 배열에
 * 담아두는 역할만 합니다. 덱 구성 추천 페이지에서 동료 선택 UI를 붙일 때
 * 이 companionData를 그대로 사용하면 됩니다.
 *
 * ⚠️ 스키마 변경 (전설/신화 등급만 사용하는 최종 데이터):
 *   - uncommon/rare/epic 등급은 더 이상 존재하지 않습니다 (덱 구성에는
 *     전설/신화만 필요하다는 판단으로 데이터에서 제거되었습니다).
 *   - type/size 필드는 항상 빈 문자열입니다 ("고유" 태그 정보가 더 이상
 *     이 필드에 담기지 않습니다 - companion-equip.js의 관련 주석 참고).
 *   - holdEffect / holdEffect12 / holdEffect25 필드는 더 이상 존재하지
 *     않습니다. 대신 special-effect[] (최대 4개, 각 {effect: "..."}) 와
 *     awaken / awaken+10 ({effect: "..."}) 로 효과 텍스트가 제공됩니다.
 * ----------------------------------------------------------------------
 */
let companionData = [];

// 등급 표기용 매핑 (rune.js의 RUNE_GRADE_NAMES와 동일한 체계)
// 최종 데이터에는 legendary/mythic만 존재하지만, 과거 데이터/다른 화면과
// 호환을 위해 나머지 등급 이름도 매핑은 남겨둡니다 (해당 등급 데이터는 없음).
const COMPANION_GRADE_NAMES = {
    uncommon: "언커먼",
    rare: "레어",
    epic: "에픽",
    legendary: "전설",
    mythic: "신화",
};

/* ==========================================================================
   동료 데이터 불러오기 (companion.json)
   ========================================================================== */
async function fetchCompanions() {
    // 다른 데이터 파일들(rune-m.json 등)과의 관례를 따라 data/ 폴더를 먼저 시도하고,
    // 없으면 루트 경로(companion.json)도 시도합니다.
    const candidatePaths = ['data/companion.json', 'companion.json'];
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
            console.log(`[companion.js] ${path} 에서 로드 성공`);
            return data;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('companion.json을 찾을 수 없습니다.');
}

async function loadCompanionDB() {
    try {
        companionData = await fetchCompanions();
        console.log(`[companion.js] 동료 데이터 로드 완료: ${companionData.length}개`);
        document.dispatchEvent(new CustomEvent("companionDataLoaded"));
    } catch (err) {
        console.error("[companion.js] 동료 데이터 로드 실패:", err);
    }
}

// 동료의 고유 식별자 (image 경로를 키로 사용 - 룬과 동일한 관례)
function companionKey(companion) {
    return companion.image;
}

// 페이지 로드 시 동료 데이터 로드
document.addEventListener("DOMContentLoaded", loadCompanionDB);
/**
 * rune.js - 룬 데이터 로딩 전용
 * ----------------------------------------------------------------------
 * 예전에는 이 파일이 "룬 도감" 갤러리 페이지(카드 리스트 + 상세 모달)도
 * 함께 그렸지만, 도감 페이지를 없애고 덱 구성 추천 기능으로 통합하면서
 * 갤러리 렌더링 코드는 제거했습니다.
 *
 * 이 파일은 이제 룬 원본 데이터(runeData)를 불러오는 역할만 하고,
 * 실제 화면(장착 슬롯, 룬 선택 피커)은 rune-equip.js가 그립니다.
 * RUNE_GRADE_NAMES / RUNE_TYPE_NAMES는 rune-equip.js에서도 참조하므로 유지합니다.
 * ----------------------------------------------------------------------
 */
let runeData = [];

// 등급/타입 표기용 매핑
const RUNE_GRADE_NAMES = {
    uncommon: "언커먼",
    rare: "레어",
    epic: "에픽",
    legendary: "전설",
    Legendary: "전설",
    mythic: "신화",
    ascension: "초월",
};
const RUNE_TYPE_NAMES = {
    main: "메인 룬",
    sub: "서브 룬",
};
const RUNE_TARGET_TYPE_NAMES = {
    companion: "🐾 동료용",
    skill: "⚡ 스킬용",
    stat: "📊 스탯용",
};

/* ==========================================================================
   룬 데이터 불러오기 (메인 + 서브 룬 전체)
   ========================================================================== */
async function loadRuneDB() {
    try {
        runeData = await fetchAllRunes();
        // 룬 장착 슬롯 등 이미 그려진 UI가 있다면 새 데이터로 다시 그림
        if (typeof renderEquipSlots === "function") renderEquipSlots();
        document.dispatchEvent(new CustomEvent("runeDataLoaded"));
    } catch (err) {
        console.error("룬 데이터 로드 실패:", err);
    }
}

// 룬의 고유 식별자 (id는 등급 내 공통 값이라 image 경로를 키로 사용)
function runeKey(rune) {
    return rune.image;
}

// 페이지 로드 시 룬 데이터 로드
document.addEventListener("DOMContentLoaded", loadRuneDB);
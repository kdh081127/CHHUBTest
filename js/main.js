const UI_STATE_STORAGE_KEY = "cathero_ui_state";
const KNOWN_MAIN_VIEWS = ["deckbuilder", "soulstone"];

// 프리셋 모달 열기/닫기
function togglePresetModal(show) {
    const modal = document.getElementById('preset-modal');
    if (!modal) return;

    if (show) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

/**
 * 상단 메인 GNB 뷰 전환 함수 (덱 구성 추천 / 냥혼석 세공)
 * @param {string} viewName - 'deckbuilder' | 'soulstone'
 */
function switchMainView(viewName) {
    if (!KNOWN_MAIN_VIEWS.includes(viewName)) viewName = "deckbuilder";

    // 1. 모든 뷰 숨기고 선택된 뷰만 표시
    KNOWN_MAIN_VIEWS.forEach((name) => {
        const el = document.getElementById("view-" + name);
        if (!el) return;
        el.classList.toggle("hidden", name !== viewName);
    });

    // 2. GNB 상단 버튼 활성화 스타일 전환
    document.querySelectorAll(".info-nav-btn").forEach((btn) => btn.classList.remove("active"));
    const activeGnb = document.getElementById("gnb-" + viewName);
    if (activeGnb) activeGnb.classList.add("active");

    // 3. "성급 변화" 물음표 버튼 표시/숨김 동기화 (덱 구성 추천 페이지 전용)
    if (typeof updateStarStateFabVisibility === "function") {
        updateStarStateFabVisibility(viewName);
    }

    saveUiState({ mainView: viewName });
}

/* ==========================================================================
   화면 상태 저장/복원 (새로고침해도 어느 화면/탭을 보고 있었는지 유지)
   ========================================================================== */
function getUiState() {
    try {
        return JSON.parse(localStorage.getItem(UI_STATE_STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function saveUiState(patch) {
    try {
        const current = getUiState();
        localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify({...current, ...patch }));
    } catch (e) { /* localStorage 사용 불가 환경은 무시 */ }
}

function restoreUiState() {
    const state = getUiState();
    if (state.mainView) switchMainView(state.mainView);
}

document.addEventListener("DOMContentLoaded", restoreUiState);
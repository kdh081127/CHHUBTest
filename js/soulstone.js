/**
 * soulstone.js - 냥혼석 세공 시뮬레이터 / 확률 계산기
 * ----------------------------------------------------------------------
 * 로스트아크 어빌리티 스톤 연마와 동일한 방식:
 *   - 증가능력1 / 증가능력2 / 감소능력1, 옵션마다 10번의 기회
 *   - 세공 확률은 75%에서 시작, 성공 시 -10%p, 실패 시 +10%p
 *   - 최저 25% / 최고 75%로 클램프
 *   - 레벨 1 = 3번 성공, 레벨 2 = 6번 성공, 레벨 3 = 9번 성공
 *
 * ⚠️ 세공 확률은 옵션별로 따로 관리되는 게 아니라 "3개 옵션 전체가 공유"합니다.
 *    예) 증가능력1에서 성공 → 전체 확률 65%로 하락
 *        → 이 상태에서 증가능력2를 성공시켜도 다시 10%p 하락(55%)
 *        → 그다음 어느 옵션이든 실패하면 다시 65%로 상승
 *    즉 "다음 시행에 적용될 확률"은 옵션 구분 없이 전체 시행 순서 하나로 갱신됩니다.
 *
 * 실제 게임에서 직접 세공하면서 "성공/실패" 버튼을 누르면 그대로 기록되고,
 * 마름모 칸과 레벨(Lv.1/2/3) 달성 지점이 실시간으로 갱신되는 트래커입니다.
 * ----------------------------------------------------------------------
 */

const SOULSTONE_START_PROB = 0.75;
const SOULSTONE_STEP = 0.10;
const SOULSTONE_MIN_PROB = 0.25;
const SOULSTONE_MAX_PROB = 0.75;
const SOULSTONE_LEVEL_THRESHOLDS = [
    { level: 1, need: 4 },
    { level: 2, need: 7 },
    { level: 3, need: 9 },
];

const SOULSTONE_ROW_DEFS = [
    { id: "inc1", label: "증가능력1", tone: "up" },
    { id: "inc2", label: "증가능력2", tone: "up" },
    { id: "dec1", label: "감소능력1", tone: "down" },
];

let soulstoneSlotCount = 10;
let soulstoneRows = {}; // { [rowId]: { results: [true/false, ...] } } - 옵션별 핀 표시/레벨 계산용
let soulstoneHistory = []; // [{ rowId, success }, ...] 실행 순서대로 쌓인 전체 시행 기록 (전체가 공유하는 확률의 근거)

function clamp01(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function initSoulstone() {
    soulstoneRows = {};
    SOULSTONE_ROW_DEFS.forEach((def) => {
        soulstoneRows[def.id] = { results: [] };
    });
    soulstoneHistory = [];
}

// 지금까지의 전체 시행 기록(soulstoneHistory)을 재생해서
// "다음 시행에 적용될 확률"을 구함 (모든 옵션이 공유하는 값)
function soulstoneCurrentGlobalProb() {
    let prob = SOULSTONE_START_PROB;
    soulstoneHistory.forEach((entry) => {
        prob = entry.success ? prob - SOULSTONE_STEP : prob + SOULSTONE_STEP;
        prob = clamp01(prob, SOULSTONE_MIN_PROB, SOULSTONE_MAX_PROB);
    });
    return prob;
}

/* ==========================================================================
   기록 / 취소 / 초기화
   ========================================================================== */
function recordSoulstoneAttempt(rowId, success) {
    const row = soulstoneRows[rowId];
    if (!row || row.results.length >= soulstoneSlotCount) return;
    row.results.push(success);
    soulstoneHistory.push({ rowId, success });
    renderSoulstone();
}

function undoSoulstoneLast() {
    const last = soulstoneHistory.pop();
    if (!last) return;
    const row = soulstoneRows[last.rowId];
    if (row && row.results.length) row.results.pop();
    renderSoulstone();
}

function resetSoulstone() {
    initSoulstone();
    renderSoulstone();
}

function changeSoulstoneSlotCount(value) {
    soulstoneSlotCount = Number(value) || 10;
    resetSoulstone();
}

/* ==========================================================================
   렌더링
   ========================================================================== */
function soulstoneCurrentLevel(row) {
    const successes = row.results.filter(Boolean).length;
    let level = 0;
    SOULSTONE_LEVEL_THRESHOLDS.forEach((t) => {
        if (successes >= t.need) level = t.level;
    });
    return level;
}

function renderSoulstone() {
    const box = document.getElementById("soulstone-rows");
    if (!box) return;

    const globalProb = soulstoneCurrentGlobalProb();
    const globalProbLabel = document.getElementById("soulstone-global-prob");
    if (globalProbLabel) globalProbLabel.textContent = `세공 확률 ${(globalProb * 100).toFixed(0)}%`;

    box.innerHTML = SOULSTONE_ROW_DEFS.map((def) => {
        const row = soulstoneRows[def.id];
        const successes = row.results.filter(Boolean).length;
        const isDone = row.results.length >= soulstoneSlotCount;
        const level = soulstoneCurrentLevel(row);
        const levelText = level > 0 ? `Lv.${level}` : "미달성";

        const markerByIndex = {};
        // SOULSTONE_LEVEL_THRESHOLDS.forEach((t) => { markerByIndex[t.need - 1] = `Lv.${t.level}`; });

        // ---- 데스크톱용 핀(clip-path 다이아몬드 - 회전 겹침 문제 없음, 모바일과 동일 기법) ----
        const desktopPipsHtml = Array.from({ length: soulstoneSlotCount }).map((_, i) => {
            const label = markerByIndex[i];
            const state = i < row.results.length ? (row.results[i] ? "success" : "fail") : "pending";
            return `
                <div class="ss-d-pip-cell">
                    <span class="ss-d-pip ${def.tone} ${state}"></span>
                    <span class="ss-d-pip-mark ${label ? "has-mark" : ""}">${label || ""}</span>
                </div>
            `;
        }).join("");

        // ---- 모바일용 핀(clip-path 다이아몬드, 5x2 그리드) ----
        const mobilePipsHtml = Array.from({ length: soulstoneSlotCount }).map((_, i) => {
            const label = markerByIndex[i];
            const state = i < row.results.length ? (row.results[i] ? "success" : "fail") : "pending";
            return `
                <div class="ss-m-pip-cell">
                    <span class="ss-m-pip ${def.tone} ${state}"></span>
                    <span class="ss-m-pip-mark ${label ? "has-mark" : ""}">${label || ""}</span>
                </div>
            `;
        }).join("");

        const actionButtonsHtml = (btnClass) => `
            <button type="button" class="${btnClass}" ${isDone ? "disabled" : ""} onclick="recordSoulstoneAttempt('${def.id}', true)">성공</button>
            <button type="button" class="${btnClass}" ${isDone ? "disabled" : ""} onclick="recordSoulstoneAttempt('${def.id}', false)">실패</button>
        `;

        return `
            <!-- 데스크톱/태블릿용 카드 -->
            <div class="soulstone-row soulstone-row-desktop">
                <div class="ss-d-header">
                    <span class="ss-d-label">${def.label}</span>
                    <span class="ss-d-level ${level > 0 ? "on" : ""}">${levelText}</span>
                    <span class="ss-d-count">${successes} / ${soulstoneSlotCount}</span>
                </div>
                <div class="ss-d-body">
                    <div class="ss-d-pip-row">${desktopPipsHtml}</div>
                    <div class="ss-d-actions">
                        ${actionButtonsHtml("ss-d-btn")}
                    </div>
                </div>
            </div>

            <!-- 모바일 전용 카드 (별도 레이아웃) -->
            <div class="soulstone-row soulstone-row-mobile">
                <div class="ss-m-head">
                    <span class="ss-m-label">${def.label}</span>
                    <span class="ss-m-badges">
                        <span class="ss-m-level ${level > 0 ? "on" : ""}">${levelText}</span>
                        <span class="ss-m-count">${successes}/${soulstoneSlotCount}</span>
                    </span>
                </div>

                <div class="ss-m-pip-grid">${mobilePipsHtml}</div>

                <div class="ss-m-actions">
                    ${actionButtonsHtml("ss-m-btn")}
                </div>
            </div>
        `;
    }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
    initSoulstone();
    renderSoulstone();
});
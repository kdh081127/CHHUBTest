/**
 * 룬 장착 UI (DPS 계산기 - "4. 메인/서브 룬 및 냥혼석" 섹션)
 * ----------------------------------------------------------------------
 * - 메인 특수 룬: 최대 4슬롯
 * - 서브 룬: 최대 6슬롯
 * - userState.equippedMainRunes / equippedSubRunes (state.js) 에 저장되며
 *   값은 각 룬의 image 경로(고유 키)입니다.
 * ----------------------------------------------------------------------
 */

const MAIN_RUNE_SLOT_COUNT = 4;
const SUB_RUNE_SLOT_COUNT = 6;

let runePickerContext = null; // { slotType: 'main'|'sub', slotIndex: number }
let runePickerGrade = "all";
let runePickerSearch = "";

/* ==========================================================================
   슬롯 렌더링
   ========================================================================== */
function findRuneByKey(key) {
    if (!key) return null;
    return (typeof runeData !== "undefined" ? runeData : []).find((r) => r.image === key) || null;
}

function renderEquipSlots() {
    renderSlotGrid("main", userState.equippedMainRunes, MAIN_RUNE_SLOT_COUNT, "main-rune-slot-grid");
    renderSlotGrid("sub", userState.equippedSubRunes, SUB_RUNE_SLOT_COUNT, "sub-rune-slot-grid");

    const mainCount = userState.equippedMainRunes.filter(Boolean).length;
    const subCount = userState.equippedSubRunes.filter(Boolean).length;
    const mainBadge = document.getElementById("main-rune-count-badge");
    const subBadge = document.getElementById("sub-rune-count-badge");
    if (mainBadge) mainBadge.textContent = `${mainCount} / ${MAIN_RUNE_SLOT_COUNT}`;
    if (subBadge) subBadge.textContent = `${subCount} / ${SUB_RUNE_SLOT_COUNT}`;
}

function renderSlotGrid(slotType, slotArray, count, containerId) {
    const box = document.getElementById(containerId);
    if (!box) return;

    let html = "";
    for (let i = 0; i < count; i++) {
        const key = slotArray[i];
        const rune = findRuneByKey(key);

        if (rune) {
            html += `
                <div class="equip-slot filled grade-${rune.grade}" onclick="openRunePicker('${slotType}', ${i})">
                    <button type="button" class="equip-slot-remove" onclick="event.stopPropagation(); unequipSlot('${slotType}', ${i})" title="장착 해제">✕</button>
                    <img src="${rune.image}" alt="${rune.name}" class="equip-slot-img" onerror="this.style.opacity=0.15">
                    <span class="equip-slot-name">${rune.name}</span>
                    <span class="rune-type-badge grade-${rune.grade}">${RUNE_GRADE_NAMES[rune.grade] || rune.grade}</span>
                </div>
            `;
        } else {
            html += `
                <div class="equip-slot empty" onclick="openRunePicker('${slotType}', ${i})">
                    <span class="equip-slot-plus">＋</span>
                    <span class="equip-slot-empty-label">룬 선택</span>
                </div>
            `;
        }
    }
    box.innerHTML = html;
}

function unequipSlot(slotType, slotIndex) {
    const arr = slotType === "main" ? userState.equippedMainRunes : userState.equippedSubRunes;
    arr[slotIndex] = null;
    saveUserState();
    renderEquipSlots();
}

/* ==========================================================================
   룬 선택 피커 모달
   ========================================================================== */
function openRunePicker(slotType, slotIndex) {
    runePickerContext = { slotType, slotIndex };
    runePickerGrade = "all";
    runePickerSearch = "";

    const title = document.getElementById("rune-picker-title");
    if (title) title.textContent = slotType === "main" ? "✨ 메인 특수 룬 선택" : "🔹 서브 룬 선택";

    const searchInput = document.getElementById("rune-picker-search-input");
    if (searchInput) searchInput.value = "";

    renderRunePickerGradeFilter();
    renderRunePickerGrid();

    const modal = document.getElementById("rune-picker-modal");
    if (modal) modal.classList.remove("hidden");
}

function filterRunePicker(category, value) {
    if (category === "search") runePickerSearch = value;
    else if (category === "grade") runePickerGrade = value;
    renderRunePickerGrid();
}

function closeRunePicker() {
    const modal = document.getElementById("rune-picker-modal");
    if (modal) modal.classList.add("hidden");
    runePickerContext = null;
}

function renderRunePickerGradeFilter() {
    const box = document.getElementById("rune-picker-grade-filter");
    if (!box) return;
    const grades = ["all", "uncommon", "rare", "epic", "legendary", "mythic", "ascension"];
    box.innerHTML = grades
        .map((g) => `
            <button type="button" class="filter-btn ${g === runePickerGrade ? "active" : ""}" onclick="selectRunePickerGrade('${g}')">
                ${g === "all" ? "전체" : (RUNE_GRADE_NAMES[g] || g)}
            </button>
        `)
        .join("");
}

function selectRunePickerGrade(grade) {
    runePickerGrade = grade;
    renderRunePickerGradeFilter();
    renderRunePickerGrid();
}

function renderRunePickerGrid() {
    const grid = document.getElementById("rune-picker-grid");
    if (!grid || !runePickerContext) return;
    // 예전엔 여기서 grid-template-columns를 인라인으로 고정(150px)해서
    // 모바일에서 CSS의 반응형 그리드 규칙(#rune-picker-grid 미디어쿼리)을
    // 덮어써버리는 문제가 있었습니다. 이제 CSS 클래스(.rune-grid)에 맡깁니다.

    const { slotType, slotIndex } = runePickerContext;
    const equippedArray = slotType === "main" ? userState.equippedMainRunes : userState.equippedSubRunes;
    const currentSlotKey = equippedArray[slotIndex];
    // 같은 종류(main/sub)에서 "다른 슬롯"에 이미 장착된 룬은 중복 장착 불가하도록 제외
    const takenKeys = new Set(equippedArray.filter((k, idx) => k && idx !== slotIndex));

    const keyword = (runePickerSearch || "").trim().toLowerCase();
    const list = (typeof runeData !== "undefined" ? runeData : []).filter((r) => {
        if (r.type !== slotType) return false;
        if (runePickerGrade !== "all" && r.grade !== runePickerGrade) return false;
        if (keyword && !(r.name || "").toLowerCase().includes(keyword)) return false;
        return true;
    });

    if (list.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:#94a3b8;">조건에 맞는 룬이 없습니다.</div>`;
        return;
    }

    grid.innerHTML = list
        .map((r) => {
                const isTaken = takenKeys.has(r.image);
                const isCurrent = r.image === currentSlotKey;
                const cardStyle = `display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px;background:#ffffff;border:1px solid ${isCurrent ? "#f59e0b" : "#e2e8f0"};border-radius:14px;position:relative;box-shadow:0 1px 2px rgba(0,0,0,0.05);${isTaken ? "opacity:0.4;cursor:not-allowed;" : "cursor:pointer;"}`;
                return `
                <div class="rune-card ${r.grade} ${isTaken ? "is-taken" : ""} ${isCurrent ? "is-current" : ""}"
                    style="${cardStyle}"
                    ${isTaken ? "" : `onclick="equipRuneToSlot('${encodeURIComponent(r.image)}')"`}>
                    ${isCurrent ? '<span class="rune-current-badge" style="position:absolute;top:6px;right:6px;font-size:9px;font-weight:800;padding:2px 6px;border-radius:999px;background:#f59e0b;color:#fff;">장착중</span>' : ""}
                    ${isTaken && !isCurrent ? '<span class="rune-taken-badge" style="position:absolute;top:6px;right:6px;font-size:9px;font-weight:800;padding:2px 6px;border-radius:999px;background:#e2e8f0;color:#64748b;">다른 슬롯</span>' : ""}
                    <span class="rune-type-badge grade-${r.grade}" style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;">${RUNE_GRADE_NAMES[r.grade] || r.grade}</span>
                    <div class="rune-img-wrapper">
                        <img src="${r.image}" alt="${r.name}" class="rune-icon" loading="lazy"
                            onerror="this.onerror=null;this.style.opacity=0.2;">
                    </div>
                    <span class="rune-name">${r.name}</span>
                </div>
            `;
        })
        .join("");
}

function equipRuneToSlot(encodedKey) {
    if (!runePickerContext) return;
    const key = decodeURIComponent(encodedKey);
    const { slotType, slotIndex } = runePickerContext;
    const arr = slotType === "main" ? userState.equippedMainRunes : userState.equippedSubRunes;
    arr[slotIndex] = key;
    saveUserState();
    renderEquipSlots();
    closeRunePicker();
}

document.addEventListener("DOMContentLoaded", renderEquipSlots);
document.addEventListener("runeDataLoaded", renderEquipSlots);
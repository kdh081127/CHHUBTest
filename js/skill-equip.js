/**
 * 스킬 장착 UI (덱 구성 추천 - "4. 스킬" 섹션)
 * ----------------------------------------------------------------------
 * - 스킬: 최대 6슬롯 (SKILL_SLOT_COUNT)
 * - userState.equippedSkills (state.js) 에 저장되며 값은 각 스킬의
 *   image 경로(고유 키)입니다.
 * - 같은 스킬을 여러 슬롯에 중복 장착할 수 없습니다 (동료/룬 장착과 동일한 관례).
 * - ⚠️ "고유" 태그가 붙은 스킬은 덱 전체에서 단 1개만 장착 가능합니다.
 *   이미 다른 슬롯에 "고유" 스킬이 장착되어 있으면, 그 슬롯을 뺀 나머지
 *   슬롯에서는 다른 "고유" 스킬을 선택할 수 없게 막습니다.
 * ----------------------------------------------------------------------
 */

const SKILL_SLOT_COUNT = 6;

let skillPickerSlotIndex = null;
let skillPickerGrade = "all";
let skillPickerSearch = "";

/* ==========================================================================
   공용 헬퍼
   ========================================================================== */
function findSkillByKey(key) {
    if (!key) return null;
    return (typeof skillData !== "undefined" ? skillData : []).find((s) => s.image === key) || null;
}

// 현재 장착된 스킬들 중 "고유" 태그를 가진 스킬의 슬롯 인덱스 (없으면 -1)
function findEquippedUniqueSkillSlotIndex(excludeSlotIndex) {
    for (let i = 0; i < userState.equippedSkills.length; i++) {
        if (i === excludeSlotIndex) continue;
        const s = findSkillByKey(userState.equippedSkills[i]);
        if (s && isUniqueSkill(s)) return i;
    }
    return -1;
}

/* ==========================================================================
   슬롯 렌더링
   ========================================================================== */
function renderSkillEquipSlots() {
    const box = document.getElementById("skill-slot-grid");
    if (!box) return;

    let html = "";
    for (let i = 0; i < SKILL_SLOT_COUNT; i++) {
        const key = userState.equippedSkills[i];
        const skill = findSkillByKey(key);

        if (skill) {
            const unique = isUniqueSkill(skill);
            html += `
                <div class="equip-slot filled grade-${skill.grade}" onclick="openSkillPicker(${i})">
                    <button type="button" class="equip-slot-remove" onclick="event.stopPropagation(); unequipSkillSlot(${i})" title="장착 해제">✕</button>
                    <img src="${skill.image}" alt="${skill.name}" class="equip-slot-img" onerror="this.style.opacity=0.15">
                    <span class="equip-slot-name">${skill.name}${unique ? " 🔒" : ""}</span>
                    <span class="skill-type-badge grade-${skill.grade}">${(typeof SKILL_GRADE_NAMES !== "undefined" && SKILL_GRADE_NAMES[skill.grade]) || skill.grade}</span>
                </div>
            `;
        } else {
            html += `
                <div class="equip-slot empty" onclick="openSkillPicker(${i})">
                    <span class="equip-slot-plus">＋</span>
                    <span class="equip-slot-empty-label">스킬 선택</span>
                </div>
            `;
        }
    }
    box.innerHTML = html;

    const count = userState.equippedSkills.filter(Boolean).length;
    const badge = document.getElementById("skill-slot-count-badge");
    if (badge) badge.textContent = `${count} / ${SKILL_SLOT_COUNT}`;
}

function unequipSkillSlot(slotIndex) {
    userState.equippedSkills[slotIndex] = null;
    saveUserState();
    renderSkillEquipSlots();
}

/* ==========================================================================
   스킬 선택 피커 모달
   ========================================================================== */
function openSkillPicker(slotIndex) {
    skillPickerSlotIndex = slotIndex;
    skillPickerGrade = "all";
    skillPickerSearch = "";

    const searchInput = document.getElementById("skill-picker-search-input");
    if (searchInput) searchInput.value = "";

    renderSkillPickerGradeFilter();
    renderSkillPickerGrid();

    const modal = document.getElementById("skill-picker-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeSkillPicker() {
    const modal = document.getElementById("skill-picker-modal");
    if (modal) modal.classList.add("hidden");
    skillPickerSlotIndex = null;
}

function filterSkillPicker(category, value) {
    if (category === "search") skillPickerSearch = value;
    else if (category === "grade") skillPickerGrade = value;
    renderSkillPickerGrid();
}

function renderSkillPickerGradeFilter() {
    const box = document.getElementById("skill-picker-grade-filter");
    if (!box) return;
    const grades = ["all", "common", "uncommon", "rare", "epic", "legendary", "mythic"];
    const names = (typeof SKILL_GRADE_NAMES !== "undefined") ? SKILL_GRADE_NAMES : {};
    box.innerHTML = grades
        .map((g) => `
            <button type="button" class="filter-btn ${g === skillPickerGrade ? "active" : ""}" onclick="selectSkillPickerGrade('${g}')">
                ${g === "all" ? "전체" : (names[g] || g)}
            </button>
        `)
        .join("");
}

function selectSkillPickerGrade(grade) {
    skillPickerGrade = grade;
    renderSkillPickerGradeFilter();
    renderSkillPickerGrid();
}

function renderSkillPickerGrid() {
    const grid = document.getElementById("skill-picker-grid");
    if (!grid || skillPickerSlotIndex === null) return;

    const slotIndex = skillPickerSlotIndex;
    const equippedArray = userState.equippedSkills;
    const currentSlotKey = equippedArray[slotIndex];
    // 다른 슬롯에 이미 장착된 스킬은 중복 장착 불가
    const takenKeys = new Set(equippedArray.filter((k, idx) => k && idx !== slotIndex));
    // "고유" 스킬은 덱 전체에서 1개만 - 이미 다른 슬롯에 있으면 그 슬롯 키만 기록
    const uniqueSlotIdx = findEquippedUniqueSkillSlotIndex(slotIndex);
    const lockedByUniqueKey = uniqueSlotIdx >= 0 ? equippedArray[uniqueSlotIdx] : null;

    const keyword = (skillPickerSearch || "").trim().toLowerCase();
    const list = (typeof skillData !== "undefined" ? skillData : []).filter((s) => {
        if (skillPickerGrade !== "all" && s.grade !== skillPickerGrade) return false;
        if (keyword && !(s.name || "").toLowerCase().includes(keyword)) return false;
        return true;
    });

    if (list.length === 0) {
        grid.innerHTML = `<div class="skill-picker-empty">조건에 맞는 스킬이 없습니다.</div>`;
        return;
    }

    const gradeNames = (typeof SKILL_GRADE_NAMES !== "undefined") ? SKILL_GRADE_NAMES : {};

    grid.innerHTML = list
        .map((s) => {
                const isTaken = takenKeys.has(s.image);
                const isCurrent = s.image === currentSlotKey;
                const unique = isUniqueSkill(s);
                // 이미 다른 슬롯에 고유 스킬이 있고, 이 카드도 고유 스킬이면서 그 스킬이 아니면 선택 불가
                const isBlockedByUniqueRule = unique && lockedByUniqueKey && s.image !== lockedByUniqueKey;
                const isDisabled = isTaken || isBlockedByUniqueRule;

                let badgeHtml = "";
                if (isCurrent) badgeHtml = '<span class="skill-picker-badge current">장착중</span>';
                else if (isTaken) badgeHtml = '<span class="skill-picker-badge taken">다른 슬롯</span>';
                else if (isBlockedByUniqueRule) badgeHtml = '<span class="skill-picker-badge locked">고유 1개 제한</span>';

                return `
                <div class="skill-picker-card grade-${s.grade} ${isCurrent ? "is-current" : ""} ${isDisabled ? "is-disabled" : ""}"
                    ${isDisabled ? "" : `onclick="equipSkillToSlot('${encodeURIComponent(s.image)}')"`}>
                    ${badgeHtml}
                    <span class="skill-type-badge grade-${s.grade}">${gradeNames[s.grade] || s.grade}${unique ? " 🔒" : ""}</span>
                    <div class="skill-picker-img-wrapper">
                        <img src="${s.image}" alt="${s.name}" class="skill-picker-icon" loading="lazy" onerror="this.onerror=null;this.style.opacity=0.2;">
                    </div>
                    <span class="skill-picker-name">${s.name}</span>
                    <span class="skill-picker-cooldown">${s.cooldown || ""}</span>
                </div>
            `;
        })
        .join("");
}

function equipSkillToSlot(encodedKey) {
    if (skillPickerSlotIndex === null) return;
    const key = decodeURIComponent(encodedKey);
    userState.equippedSkills[skillPickerSlotIndex] = key;
    saveUserState();
    renderSkillEquipSlots();
    closeSkillPicker();
}

document.addEventListener("DOMContentLoaded", renderSkillEquipSlots);
document.addEventListener("skillDataLoaded", renderSkillEquipSlots);
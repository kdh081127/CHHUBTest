/**
 * 빌드 저장/적용 (동료·룬·스킬 사이드탭 - "📋 저장한 빌드")
 * ----------------------------------------------------------------------
 * - 빌드 1개 = userState의 동료+메인룬+서브룬+스킬 장착 상태를 통째로 스냅샷.
 * - localStorage(cathero_saved_builds)에 배열로 저장되며, 동료/룬/스킬 세 탭
 *   어디서 저장하거나 적용해도 같은 목록을 공유합니다(하나의 빌드 = 세 파트 세트).
 * - 각 탭의 "직접 선택" ↔ "빌드" 전환은 switchSidePanel()이 담당합니다.
 * ----------------------------------------------------------------------
 */

const BUILD_STORAGE_KEY = "cathero_saved_builds";

// 사이드탭/모달 컨테이너 id 매핑 (key -> 빌드 리스트를 그릴 DOM id)
// "modal"은 "📂 덱 구성 불러오기" 버튼으로 여는 전역 모달의 목록입니다.
const BUILD_LIST_CONTAINER_IDS = {
    companions: "build-list-companions",
    runes: "build-list-runes",
    skills: "build-list-skills",
    modal: "build-load-modal-list",
};

/* ==========================================================================
   0. 저장/불러오기 (localStorage)
   ========================================================================== */
function getSavedBuilds() {
    try {
        const parsed = JSON.parse(localStorage.getItem(BUILD_STORAGE_KEY));
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function setSavedBuilds(list) {
    try {
        localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(list));
    } catch (e) { /* localStorage 사용 불가 환경은 무시 */ }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

// 빌드 목록에 표시할 "동료 4 · 룬 7 · 스킬 6" 요약 텍스트
function buildSummaryText(build) {
    const d = (build && build.data) || {};
    const companionCount = (d.equippedCompanions || []).filter(Boolean).length;
    const runeCount = (d.equippedMainRunes || []).filter(Boolean).length + (d.equippedSubRunes || []).filter(Boolean).length;
    const skillCount = (d.equippedSkills || []).filter(Boolean).length;
    return `동료 ${companionCount} · 룬 ${runeCount} · 스킬 ${skillCount}`;
}

/* ==========================================================================
   1. 사이드탭 전환 ("직접 선택" ↔ "빌드")
   ========================================================================== */
function switchSidePanel(sectionKey, btnEl) {
    const layout = btnEl.closest(".section-side-layout");
    if (!layout) return;
    const panelName = btnEl.dataset.panel;

    layout.querySelectorAll(".side-tab-btn").forEach((btn) => btn.classList.toggle("active", btn === btnEl));
    layout.querySelectorAll(".section-side-panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.dataset.panel !== panelName);
    });

    if (panelName === "builds") renderBuildListInto(sectionKey);
}

/* ==========================================================================
   1-1. "📂 덱 구성 불러오기" 모달
   ========================================================================== */
function openBuildLoadModal() {
    renderBuildListInto("modal");
    const modal = document.getElementById("build-load-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeBuildLoadModal() {
    const modal = document.getElementById("build-load-modal");
    if (modal) modal.classList.add("hidden");
}

/* ==========================================================================
   2. 빌드 목록 렌더링
   ========================================================================== */
function renderBuildListInto(sectionKey) {
    const containerId = BUILD_LIST_CONTAINER_IDS[sectionKey];
    const box = containerId && document.getElementById(containerId);
    if (!box) return;

    const builds = getSavedBuilds();

    if (builds.length === 0) {
        box.innerHTML = `<div class="build-list-empty">아직 저장된 빌드가 없습니다. 원하는 조합을 장착한 뒤 위에서 이름을 입력하고 저장해보세요.</div>`;
        return;
    }

    box.innerHTML = builds
        .map((b) => `
            <div class="preset-item build-item">
                <div class="preset-item-info">
                    <span class="preset-item-name">${escapeHtml(b.name)}</span>
                    <span class="preset-item-date">${b.date} · ${buildSummaryText(b)}</span>
                </div>
                <div style="display:flex; gap:0.25rem;">
                    <button type="button" class="btn-preset-action btn-preset-save" onclick="applyBuild('${b.id}')">적용</button>
                    <button type="button" class="btn-preset-action btn-preset-manage" onclick="deleteBuild('${b.id}')">삭제</button>
                </div>
            </div>
        `)
        .join("");
}

// 세 탭 모두 동일한 목록을 공유하므로, 저장/삭제 후에는 열려 있을 수 있는 세 곳을 전부 갱신
function renderAllBuildLists() {
    Object.keys(BUILD_LIST_CONTAINER_IDS).forEach((key) => renderBuildListInto(key));
}

/* ==========================================================================
   3. 빌드 저장
   ----------------------------------------------------------------------
   ⚠️ 예전에는 동료/룬/스킬 탭마다 각각 "저장" 입력창이 있었는데, 어차피
   빌드 하나가 세 파트를 통째로 저장하는 거라 3곳에 나눠 저장할 필요가
   없다는 피드백을 반영해 저장 UI를 "🗂 빌드로 저장" 섹션 한 곳으로
   합쳤습니다. 동료·룬·스킬을 각각 최소 1개 이상 장착해야만(=isBuildReady)
   저장 버튼이 활성화됩니다.
   ========================================================================== */
function isBuildReady() {
    if (typeof userState === "undefined") return false;
    const companionCount = (userState.equippedCompanions || []).filter(Boolean).length;
    const runeCount = (userState.equippedMainRunes || []).filter(Boolean).length + (userState.equippedSubRunes || []).filter(Boolean).length;
    const skillCount = (userState.equippedSkills || []).filter(Boolean).length;
    return companionCount > 0 && runeCount > 0 && skillCount > 0;
}

function buildReadinessMissingParts() {
    if (typeof userState === "undefined") return ["동료", "룬", "스킬"];
    const missing = [];
    const companionCount = (userState.equippedCompanions || []).filter(Boolean).length;
    const runeCount = (userState.equippedMainRunes || []).filter(Boolean).length + (userState.equippedSubRunes || []).filter(Boolean).length;
    const skillCount = (userState.equippedSkills || []).filter(Boolean).length;
    if (companionCount === 0) missing.push("동료");
    if (runeCount === 0) missing.push("룬");
    if (skillCount === 0) missing.push("스킬");
    return missing;
}

// 동료/룬/스킬 슬롯 그리드가 다시 그려질 때마다(장착·해제·빌드 적용 등) 자동으로
// 저장 버튼 활성화 상태를 갱신합니다. companion-equip.js/rune-equip.js/
// skill-equip.js 내부 함수 이름을 몰라도 동작하도록 DOM 변화를 직접 감시합니다.
function updateBuildReadinessUI() {
    const btn = document.getElementById("build-save-btn-global");
    const msg = document.getElementById("build-readiness-msg");
    const ready = isBuildReady();

    if (btn) btn.disabled = !ready;
    if (msg) {
        if (ready) {
            msg.textContent = "";
            msg.classList.remove("is-warning");
        } else {
            const missing = buildReadinessMissingParts();
            msg.textContent = `${missing.join(" · ")} 파트를 먼저 1개 이상 장착해주세요.`;
            msg.classList.add("is-warning");
        }
    }
}

function watchEquipGridsForBuildReadiness() {
    const gridIds = ["companion-slot-grid", "main-rune-slot-grid", "sub-rune-slot-grid", "skill-slot-grid"];
    gridIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        new MutationObserver(updateBuildReadinessUI).observe(el, { childList: true, subtree: true });
    });
    updateBuildReadinessUI();
}

function saveCurrentBuild(sectionKey) {
    if (!isBuildReady()) {
        alert("동료·룬·스킬을 각각 최소 1개 이상 장착한 뒤에 저장할 수 있습니다.");
        return;
    }

    const input = document.getElementById(`build-name-input-${sectionKey}`);
    const name = input ? input.value.trim() : "";
    if (!name) {
        alert("빌드 이름을 입력해주세요.");
        return;
    }
    if (typeof userState === "undefined") return;

    const builds = getSavedBuilds();
    builds.unshift({
        id: "build_" + Date.now(),
        name,
        date: new Date().toISOString().slice(0, 10),
        data: {
            equippedMainRunes: [...userState.equippedMainRunes],
            equippedSubRunes: [...userState.equippedSubRunes],
            equippedCompanions: [...userState.equippedCompanions],
            equippedSkills: [...userState.equippedSkills],
        },
    });
    setSavedBuilds(builds);

    if (input) input.value = "";
    renderAllBuildLists();
    alert(`'${name}' 빌드를 저장했습니다.`);
}

/* ==========================================================================
   4. 빌드 적용
   ----------------------------------------------------------------------
   ⚠️ 동료/룬 장착 슬롯을 다시 그리는 함수(renderCompanionEquipSlots,
   renderEquipSlots)는 companion-equip.js / rune-equip.js에서 이미 확인한
   이름입니다. 스킬 쪽(skill-equip.js)은 지금까지 저에게 공유되지 않아서
   렌더 함수 이름을 정확히 알 수 없어, 같은 작명 규칙으로 추정되는 몇 가지
   이름을 순서대로 시도합니다. 혹시 스킬 슬롯이 빌드 적용 후 바로 안 바뀌고
   페이지가 새로고침된다면 skill-equip.js 파일도 보내주세요 — 그러면 정확한
   함수 이름으로 맞춰서 새로고침 없이 즉시 반영되게 고칠 수 있습니다.
   ========================================================================== */
function refreshSkillEquipUI() {
    const candidates = ["renderSkillEquipSlots", "renderSkillSlots", "renderEquipSkillSlots"];
    for (const fnName of candidates) {
        if (typeof window[fnName] === "function") {
            window[fnName]();
            return true;
        }
    }
    return false;
}

function applyBuild(id) {
    const builds = getSavedBuilds();
    const build = builds.find((b) => b.id === id);
    if (!build || typeof userState === "undefined") return;

    const d = build.data || {};
    userState.equippedMainRunes = normalizeSlots(d.equippedMainRunes || [], 4);
    userState.equippedSubRunes = normalizeSlots(d.equippedSubRunes || [], 6);
    userState.equippedCompanions = normalizeSlots(d.equippedCompanions || [], 6);
    userState.equippedSkills = normalizeSlots(d.equippedSkills || [], 6);
    saveUserState();

    if (typeof renderCompanionEquipSlots === "function") renderCompanionEquipSlots();
    if (typeof renderEquipSlots === "function") renderEquipSlots();
    const skillRefreshed = refreshSkillEquipUI();

    closeBuildLoadModal();
    alert(`'${build.name}' 빌드를 적용했습니다.`);

    // 스킬 슬롯을 즉시 다시 그릴 방법을 못 찾은 경우에만 안전하게 새로고침
    // (userState는 이미 저장됐으므로 새로고침해도 적용한 빌드 그대로 보입니다)
    if (!skillRefreshed) {
        location.reload();
    }
}

/* ==========================================================================
   5. 빌드 삭제
   ========================================================================== */
function deleteBuild(id) {
    const builds = getSavedBuilds();
    const build = builds.find((b) => b.id === id);
    if (!build) return;
    if (!confirm(`'${build.name}' 빌드를 삭제하시겠습니까?`)) return;

    setSavedBuilds(builds.filter((b) => b.id !== id));
    renderAllBuildLists();
}

document.addEventListener("DOMContentLoaded", renderAllBuildLists);
document.addEventListener("DOMContentLoaded", watchEquipGridsForBuildReadiness);
/**
 * tierlist.js - "덱 티어리스트" 탭
 * ----------------------------------------------------------------------
 * data/preset-builds.json에 있는 프리셋 빌드와 같은 데이터를 그대로 씁니다.
 * 별도 JSON 파일 없이, 각 빌드 항목에 "tier": 1, 2, 3 처럼 순위 숫자를
 * 넣어두면 그 숫자 순서대로 여기 목록에 나타납니다. tier가 없거나 null인
 * 빌드는 티어리스트에는 안 나오고(기존 "바로 세팅" 프리셋 빌드 목록에는
 * 계속 나옵니다), 숫자가 작을수록 위쪽(1등)에 표시됩니다.
 *
 * 항목을 클릭하면 preset-builds.js의 "바로 세팅"처럼 장착이 되는 게
 * 아니라, 동료/메인룬/서브룬/스킬 구성을 이름이 아니라 아이콘 이미지로
 * 펼쳐서 보여줍니다. companion.js/rune.js/skills.js가 이미 불러온
 * companionData/runeData/skillData를 쓰지 않고, 이 파일이 data/companion.json,
 * rune-m.json, rune-s.json, skills.json을 직접 한 번 더 불러옵니다 - 그래야
 * 다른 스크립트의 로딩 타이밍(어떤 스크립트가 먼저 끝나는지)에 상관없이
 * 항상 이미지를 정확히 찾을 수 있습니다.
 * ----------------------------------------------------------------------
 */

const TIERLIST_CONTAINER_ID = "tierlist-content";

let tierlistData = [];
let tierlistExpandedId = null;

// 이름 -> image 경로 매핑 (동료/스킬). 룬은 등급이 겹치는 이름이 많아서 별도 처리.
let tierlistCompanionImageByName = {};
let tierlistSkillImageByName = {};
// "이름__등급" -> image (정확 매칭), 이름만으로 찾는 폴백용 "이름" -> image (처음 찾은 것)
let tierlistRuneImageByNameGrade = {};
let tierlistRuneImageByNameOnly = {};

async function fetchJsonTierlist(paths) {
    for (const path of paths) {
        try {
            const res = await fetch(path);
            if (res.ok) return await res.json();
        } catch (e) { /* 다음 경로 시도 */ }
    }
    return null;
}

async function fetchTierlistPresets() {
    const json = await fetchJsonTierlist(["data/preset-builds.json", "preset-builds.json"]);
    if (!json) return [];
    const presets = Array.isArray(json) ? json : json.presets;
    return Array.isArray(presets) ? presets : [];
}

function escapeHtmlTierlist(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

// 룬 항목은 문자열("생선 증폭")이거나 { name, grade } 객체일 수 있습니다
// (preset-builds.js와 preset-builder.html에서 쓰는 것과 같은 형식).
function tierEntryName(entry) {
    return typeof entry === "string" ? entry : entry && entry.name;
}
function tierEntryGrade(entry) {
    return typeof entry === "object" && entry ? entry.grade : null;
}
function tierEntryLabel(entry) {
    const name = tierEntryName(entry);
    const grade = tierEntryGrade(entry);
    return grade ? `${name} (${grade})` : name;
}

/* ==========================================================================
   0. 데이터 로딩 (preset-builds.json + companion/rune/skill 원본 이미지 매핑)
   ========================================================================== */
async function initTierlist() {
    const [presets, companions, runesMain, runesSub, skills] = await Promise.all([
        fetchTierlistPresets(),
        fetchJsonTierlist(["data/companion.json", "companion.json"]),
        fetchJsonTierlist(["data/rune-m.json", "rune-m.json"]),
        fetchJsonTierlist(["data/rune-s.json", "rune-s.json"]),
        fetchJsonTierlist(["data/skills.json", "skills.json"]),
    ]);

    (Array.isArray(companions) ? companions : []).forEach((c) => {
        tierlistCompanionImageByName[c.name] = c.image;
    });
    (Array.isArray(skills) ? skills : []).forEach((s) => {
        tierlistSkillImageByName[s.name] = s.image;
    });
    [...(Array.isArray(runesMain) ? runesMain : []), ...(Array.isArray(runesSub) ? runesSub : [])].forEach((r) => {
        tierlistRuneImageByNameGrade[`${r.name}__${r.grade}`] = r.image;
        if (!(r.name in tierlistRuneImageByNameOnly)) tierlistRuneImageByNameOnly[r.name] = r.image;
    });

    tierlistData = presets
        .filter((p) => typeof p.tier === "number")
        .sort((a, b) => a.tier - b.tier);
    renderTierlist();
}

function companionImage(name) {
    return tierlistCompanionImageByName[name] || "";
}
function skillImage(name) {
    return tierlistSkillImageByName[name] || "";
}
function runeImage(entry) {
    const name = tierEntryName(entry);
    const grade = tierEntryGrade(entry);
    if (grade && tierlistRuneImageByNameGrade[`${name}__${grade}`]) {
        return tierlistRuneImageByNameGrade[`${name}__${grade}`];
    }
    return tierlistRuneImageByNameOnly[name] || "";
}

/* ==========================================================================
   1. 렌더링 (클릭하면 구성 아이콘을 펼쳐 보이기)
   ========================================================================== */
function tierlistIconGrid(entries, imageFn) {
    const items = (entries || []).filter((entry) => tierEntryName(entry) && String(tierEntryName(entry)).trim());
    if (items.length === 0) return `<span class="tierlist-row-empty">-</span>`;

    return `
        <div class="tierlist-icon-grid">
            ${items
                .map((entry) => {
                    const name = tierEntryName(entry);
                    const label = tierEntryLabel(entry);
                    const img = imageFn(entry);
                    return `
                        <div class="tierlist-icon-cell" title="${escapeHtmlTierlist(label)}">
                            ${img
                                ? `<img src="${escapeHtmlTierlist(img)}" alt="${escapeHtmlTierlist(name)}" class="tierlist-icon-img" loading="lazy" onerror="this.onerror=null;this.style.opacity=0.2;">`
                                : `<span class="tierlist-icon-missing">?</span>`}
                            <span class="tierlist-icon-name">${escapeHtmlTierlist(name)}</span>
                        </div>
                    `;
                })
                .join("")}
        </div>
    `;
}

function renderTierlist() {
    const box = document.getElementById(TIERLIST_CONTAINER_ID);
    if (!box) return;

    if (tierlistData.length === 0) {
        box.innerHTML = `<div class="build-list-empty">아직 순위가 매겨진 빌드가 없습니다. data/preset-builds.json의 각 빌드에 "tier": 1, 2, 3처럼 순위 숫자를 넣어주세요.</div>`;
        return;
    }

    box.innerHTML = tierlistData
        .map((p) => {
            const expanded = tierlistExpandedId === p.id;
            return `
                <div class="tierlist-item${expanded ? " expanded" : ""}">
                    <button type="button" class="tierlist-item-head" onclick="toggleTierlistItem('${p.id}')">
                        <span class="tierlist-rank">${p.tier}</span>
                        <span class="tierlist-name">${escapeHtmlTierlist(p.name)}</span>
                        ${p.description ? `<span class="tierlist-desc">${escapeHtmlTierlist(p.description)}</span>` : ""}
                        <span class="tierlist-toggle-icon">${expanded ? "-" : "+"}</span>
                    </button>
                    ${expanded ? `
                        <div class="tierlist-item-body">
                            <div class="tierlist-row">
                                <span class="tierlist-row-label">동료</span>
                                ${tierlistIconGrid(p.companions, (e) => companionImage(tierEntryName(e)))}
                            </div>
                            <div class="tierlist-row">
                                <span class="tierlist-row-label">메인룬</span>
                                ${tierlistIconGrid(p.mainRunes, runeImage)}
                            </div>
                            <div class="tierlist-row">
                                <span class="tierlist-row-label">서브룬</span>
                                ${tierlistIconGrid(p.subRunes, runeImage)}
                            </div>
                            <div class="tierlist-row">
                                <span class="tierlist-row-label">스킬</span>
                                ${tierlistIconGrid(p.skills, (e) => skillImage(tierEntryName(e)))}
                            </div>
                        </div>
                    ` : ""}
                </div>
            `;
        })
        .join("");
}

function toggleTierlistItem(id) {
    tierlistExpandedId = tierlistExpandedId === id ? null : id;
    renderTierlist();
}

/* ==========================================================================
   2. switchMainView('tierlist') 연결
   ----------------------------------------------------------------------
   main.js 파일을 이번 세션에도 받지 못해서, 기존 "deckbuilder"/"soulstone"
   처리 방식은 건드리지 않고 "tierlist"만 새로 처리하도록 switchMainView를
   감싸는 방식을 썼습니다(js/build.js의 rewards 탭 때 쓴 것과 같은 방식).
   main.js 파일을 보내주시면 그 안에 깔끔하게 합쳐드릴게요.
   ========================================================================== */
function patchSwitchMainViewForTierlist() {
    const original = typeof window.switchMainView === "function" ? window.switchMainView : null;

    window.switchMainView = function (view) {
        if (view !== "tierlist") {
            if (original) original(view);
            return;
        }
        document.querySelectorAll(".info-nav-btn").forEach((btn) => btn.classList.remove("active"));
        const navBtn = document.getElementById("gnb-tierlist");
        if (navBtn) navBtn.classList.add("active");

        document.querySelectorAll('[id^="view-"]').forEach((el) => el.classList.add("hidden"));
        const viewEl = document.getElementById("view-tierlist");
        if (viewEl) viewEl.classList.remove("hidden");
    };
}

document.addEventListener("DOMContentLoaded", () => {
    // main.js가 이 스크립트보다 나중에 로드되므로, switchMainView 정의가
    // 끝난 뒤인 DOMContentLoaded 시점에 감쌉니다.
    patchSwitchMainViewForTierlist();
    initTierlist();
});

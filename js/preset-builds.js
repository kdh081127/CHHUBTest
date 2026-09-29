/**
 * preset-builds.js - 미리 준비된 "추천 프리셋 빌드" (예: 포탄빌드, 할퀴기빌드, 종탄빌드)
 * ----------------------------------------------------------------------
 * build.js의 "저장한 빌드"는 사용자가 직접 장착 후 저장한 것이고, 이 파일은
 * 그와 별개로 data/preset-builds.json에 미리 적어둔 "완성된 조합"을 목록에서
 * 골라 클릭 한 번에 바로 장착하는 기능입니다. (사용자 피드백: "포탄빌드,
 * 할퀴기빌드, 종탄빌드 이런것들 세팅이 바로바로 되게 하는 기능")
 *
 * 실제 빌드 구성(어떤 동료·룬·스킬을 쓰는지)은 게임 메타 지식이 필요해서
 * 코드만으로는 알 수 없습니다. data/preset-builds.json에 이름만 채워두면
 * 이 파일이 companionData/runeData/skillData에서 이름으로 찾아 적용합니다.
 * ----------------------------------------------------------------------
 */

let presetBuildsData = [];
let presetBuildsNote = "";

const PRESET_BUILDS_CONTAINER_ID = "preset-build-list";

/* ==========================================================================
   0. 데이터 로딩 (companion.js의 fetchCompanions()와 같은 관례)
   ========================================================================== */
async function fetchPresetBuilds() {
    const candidatePaths = ["data/preset-builds.json", "preset-builds.json"];
    let lastError = null;

    for (const path of candidatePaths) {
        try {
            const res = await fetch(path);
            if (!res.ok) {
                lastError = new Error(`${path} 요청 실패 (status ${res.status})`);
                continue;
            }
            const json = await res.json();
            const presets = Array.isArray(json) ? json : json.presets;
            if (!Array.isArray(presets)) {
                lastError = new Error(`${path}에 presets 배열이 없습니다.`);
                continue;
            }
            console.log(`[preset-builds.js] ${path} 에서 로드 성공`);
            return { presets, note: (!Array.isArray(json) && json.note) || "" };
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("preset-builds.json을 찾을 수 없습니다.");
}

async function loadPresetBuilds() {
    try {
        const { presets, note } = await fetchPresetBuilds();
        presetBuildsData = presets;
        presetBuildsNote = note;
        console.log(`[preset-builds.js] 프리셋 빌드 ${presetBuildsData.length}개 로드 완료`);
        renderPresetBuildList();
    } catch (err) {
        console.error("[preset-builds.js] 프리셋 빌드 로드 실패:", err);
        renderPresetBuildList(); // 실패해도 "목록 없음" 상태로 렌더링
    }
}

/* ==========================================================================
   1. 이름 -> 실제 데이터 항목 매칭
   ========================================================================== */
function findCompanionByName(name) {
    return (typeof companionData !== "undefined" ? companionData : []).find((c) => c.name === name);
}

function findSkillByName(name) {
    return (typeof skillData !== "undefined" ? skillData : []).find((s) => s.name === name);
}
// 룬은 이름이 같아도 등급이 다른 버전이 여러 개 있는 경우가 많습니다
// (예: "생선 증폭"이 uncommon과 legendary에 둘 다 존재). 그래서 룬 항목은
// 문자열("생선 증폭")뿐 아니라 { "name": "생선 증폭", "grade": "legendary" }
// 형태도 지원합니다 — grade까지 있으면 정확히 그 등급을 찾고, 문자열만 있으면
// (레거시 데이터 호환용) 이름이 같은 것 중 처음 찾은 걸로 대체합니다.
function findRuneByName(entry, runeType) {
    const all = typeof runeData !== "undefined" ? runeData : [];
    const name = typeof entry === "string" ? entry : entry && entry.name;
    const grade = typeof entry === "object" && entry ? entry.grade : null;

    if (grade) {
        const exactWithType = all.find((r) => r.name === name && r.grade === grade && r.type === runeType);
        if (exactWithType) return exactWithType;
        const exactNoType = all.find((r) => r.name === name && r.grade === grade);
        if (exactNoType) return exactNoType;
        // grade를 지정했는데 그 등급으로는 못 찾으면(오타 등), 이름만으로라도 찾기 전에
        // 아래 폴백으로 넘어갑니다.
    }

    // runeData는 메인/서브 룬이 한 배열에 합쳐져 있고 type 필드("main-rune"/"sub-rune")로
    // 구분된다는 전제로 먼저 찾습니다 (rune-m.json/rune-s.json 원본 데이터 기준으로는 맞는
    // 전제입니다).
    const exact = all.find((r) => r.name === name && r.type === runeType);
    if (exact) return exact;
    // 폴백: 혹시 rune.js가 합치는 과정에서 type 값을 다르게 쓰고 있을 경우를 대비해,
    // type 필터 없이 이름만으로도 찾습니다.
    return all.find((r) => r.name === name);
}

// 경고 메시지에 표시할 라벨 ("생선 증폭" 또는 "생선 증폭 (legendary)")
function runeEntryLabel(entry) {
    if (typeof entry === "string") return entry;
    if (entry && entry.name) return entry.grade ? `${entry.name} (${entry.grade})` : entry.name;
    return String(entry);
}

// preset.companions/mainRunes/subRunes/skills 배열을 실제 image 키 배열로 변환.
// 못 찾은 항목은 unresolved에 모아서 돌려줍니다(오탈자 등으로 조용히 누락되지 않도록).
// 빈 문자열/공백만 있는 항목은 "아직 안 채운 자리"로 보고 조용히 건너뜁니다.
function resolvePresetBuild(preset) {
    const unresolved = { companions: [], mainRunes: [], subRunes: [], skills: [] };

    const resolveList = (entries, finder, category, labelFn) => {
        const keys = [];
        (entries || []).forEach((entry) => {
            const name = typeof entry === "string" ? entry : entry && entry.name;
            if (!name || !String(name).trim()) return; // 빈 문자열은 무시 (경고 대상 아님)
            const item = finder(entry);
            if (item) keys.push(item.image);
            else unresolved[category].push((labelFn || String)(entry));
        });
        return keys;
    };

    const companions = resolveList(preset.companions, findCompanionByName, "companions");
    const mainRunes = resolveList(preset.mainRunes, (e) => findRuneByName(e, "main-rune"), "mainRunes", runeEntryLabel);
    const subRunes = resolveList(preset.subRunes, (e) => findRuneByName(e, "sub-rune"), "subRunes", runeEntryLabel);
    const skills = resolveList(preset.skills, findSkillByName, "skills");

    const hasAnyUnresolved = Object.values(unresolved).some((arr) => arr.length > 0);
    return { companions, mainRunes, subRunes, skills, unresolved, hasAnyUnresolved };
}

// 목록에 표시할 요약 텍스트 (원본 이름 배열 기준 - 아직 데이터가 로드되기 전에도 표시 가능)
function presetSummaryText(preset) {
    const companionCount = (preset.companions || []).length;
    const runeCount = (preset.mainRunes || []).length + (preset.subRunes || []).length;
    const skillCount = (preset.skills || []).length;
    return `동료 ${companionCount} · 룬 ${runeCount} · 스킬 ${skillCount}`;
}

function isPresetConfigured(preset) {
    return (preset.companions || []).length > 0 || (preset.mainRunes || []).length > 0 ||
        (preset.subRunes || []).length > 0 || (preset.skills || []).length > 0;
}

/* ==========================================================================
   2. 렌더링
   ========================================================================== */
function renderPresetBuildList() {
    const box = document.getElementById(PRESET_BUILDS_CONTAINER_ID);
    if (!box) return;

    if (!presetBuildsData.length) {
        box.innerHTML = `<div class="build-list-empty">프리셋 빌드 데이터를 불러오지 못했습니다.</div>`;
        return;
    }

    box.innerHTML = presetBuildsData
        .map((p) => {
                const configured = isPresetConfigured(p);
                return `
            <div class="preset-item build-item preset-build-item">
                <div class="preset-item-info">
                    <span class="preset-item-name">${escapeHtml(p.name)}</span>
                    <span class="preset-item-date">${escapeHtml(presetSummaryText(p))}</span>
                    ${p.description ? `<span class="preset-item-desc">${escapeHtml(p.description)}</span>` : ""}
                    ${!configured ? `<span class="preset-item-desc preset-build-unconfigured">아직 구성이 입력되지 않았습니다 (data/preset-builds.json)</span>` : ""}
                </div>
                <div style="display:flex; gap:0.25rem;">
                    <button type="button" class="btn-preset-action btn-preset-save" onclick="applyPresetBuild('${p.id}')" ${configured ? "" : "disabled"}>바로 세팅</button>
                </div>
            </div>
        `;
        })
        .join("");
}

/* ==========================================================================
   3. 프리셋 빌드 적용
   ----------------------------------------------------------------------
   build.js의 applyBuild()와 동일한 패턴(userState 갱신 -> 장착 슬롯 UI 다시 그리기)을
   따릅니다. 스킬 슬롯을 다시 그리는 함수 이름이 불명확한 문제도 build.js와 동일하게
   refreshSkillEquipUI()의 후보 이름 탐색으로 처리합니다.
   ========================================================================== */
function applyPresetBuild(id) {
    // 장착 슬롯을 직접 바꾸는 기능이라, 다른 장착 기능들과 마찬가지로
    // 로그인 후에만 쓸 수 있게 합니다(백엔드가 아직 설정 안 됐으면 막지 않습니다).
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (typeof supabaseClient !== "undefined" && supabaseClient && !user) {
        if (typeof openAuthModal === "function") openAuthModal("login");
        const gateMsg = document.getElementById("auth-gate-msg");
        if (gateMsg) gateMsg.classList.remove("hidden");
        return;
    }

    const preset = presetBuildsData.find((p) => p.id === id);
    if (!preset || typeof userState === "undefined") return;

    if (!isPresetConfigured(preset)) {
        alert(`'${preset.name}' 빌드는 아직 구성이 입력되지 않았습니다. data/preset-builds.json을 채워주세요.`);
        return;
    }

    const resolved = resolvePresetBuild(preset);

    if (resolved.hasAnyUnresolved) {
        const lines = [];
        if (resolved.unresolved.companions.length) lines.push(`동료: ${resolved.unresolved.companions.join(", ")}`);
        if (resolved.unresolved.mainRunes.length) lines.push(`메인룬: ${resolved.unresolved.mainRunes.join(", ")}`);
        if (resolved.unresolved.subRunes.length) lines.push(`서브룬: ${resolved.unresolved.subRunes.join(", ")}`);
        if (resolved.unresolved.skills.length) lines.push(`스킬: ${resolved.unresolved.skills.join(", ")}`);
        const proceed = confirm(
            `'${preset.name}' 빌드에서 아래 이름을 찾지 못했습니다(오탈자이거나 데이터에 없는 이름일 수 있습니다):\n\n${lines.join("\n")}\n\n찾은 항목만이라도 적용할까요?`
        );
        if (!proceed) return;
    }

    userState.equippedMainRunes = normalizeSlots(resolved.mainRunes, 4);
    userState.equippedSubRunes = normalizeSlots(resolved.subRunes, 6);
    userState.equippedCompanions = normalizeSlots(resolved.companions, 6);
    userState.equippedSkills = normalizeSlots(resolved.skills, 6);
    saveUserState();

    if (typeof renderCompanionEquipSlots === "function") renderCompanionEquipSlots();
    if (typeof renderEquipSlots === "function") renderEquipSlots();
    const skillRefreshed = typeof refreshSkillEquipUI === "function" ? refreshSkillEquipUI() : false;

    alert(`'${preset.name}' 빌드를 적용했습니다.`);

    if (!skillRefreshed) {
        location.reload();
    }
}

document.addEventListener("DOMContentLoaded", loadPresetBuilds);
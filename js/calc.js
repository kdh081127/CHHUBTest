/**
 * calc.js - 덱 구성 추천 계산 로직 (룬 + 동료 + 스킬 시너지 반영판)
 * ----------------------------------------------------------------------
 * 기본 공격력(1~10,000)에 장착한 룬(메인+서브)·동료·스킬의 효과 문구를
 * 텍스트 기반으로 해석해서 "이 조합이 얼마나 시너지가 나는지"를
 * 근사치로 계산합니다.
 *
 * 처리 흐름:
 *   1) 장착한 룬/스킬의 "보유효과"(예: "공격력 증폭 +40%")를 모아
 *      전역 공격력 배율(finalAtk)을 구합니다.
 *   2) 각 장착 스킬의 "효과" 문구에서 가장 큰 %를 기본 피해 계수로 삼습니다.
 *   3) 장착한 룬(메인/서브)·동료(특수효과/각성/각성+10)의 효과 문구를 훑어서
 *      - "장착한 OO 동료 하나 당 ~" 처럼 동료 타입(종/크기) 개수에 비례하는
 *        효과는 companion.type[]/companion.size와 대조해서 실제 장착 수를
 *        세고, "1마리당 %" × "장착 수"만큼 적용 대상 스킬에 가산
 *      - 특정 스킬 이름이 언급되고, 그 근처에 "피해/데미지/계수" +
 *        "N% 증가/강화" 패턴이 있으면 → 그 스킬의 피해 계수에 가산
 *      - "OO 타입 스킬" / "OO, XX 타입 스킬"처럼 스킬 이름 없이 타입으로
 *        언급되면 → 그 타입을 가진 장착 스킬 전원에게 가산
 *      - "모든 스킬"/"모든 피해량"/"치명타로 입히는 피해" 같은 전체형
 *        문구는 → 장착 스킬 전원에게 가산
 *      - "공격력 증폭 +N%" 류는 전역 공격력 배율에 가산
 *   4) 그래도 적용 대상을 특정하지 못한 특이 케이스만 화면 하단에
 *      "반영되지 않은 효과"로 안내합니다 (정상적인 경우 거의 비어있어야 함).
 *
 * companion.json의 동료마다 `type`(배열: 고양이/기계/디저트/음식/매콤/해적/
 * 고래/상어/늑대/그림자/구름/마법/닭/용/동물/고유 등)과 `size`(단일 문자열:
 * 소형/중형/대형)가 채워져 있어야 위 1)의 "동료 타입 개수 비례" 효과가
 * 정확히 계산됩니다. 둘 중 하나라도 비어있는 동료는 그 동료가 "0마리"로
 * 집계되어 해당 동료가 기여해야 할 카운트 보너스가 누락될 수 있습니다.
 *
 * 텍스트를 정규식으로 해석하는 방식이라 게임 내 정확한 공식이 아닌
 * 근사치이며, 치명타 확률, PVP 스탯, 재사용 대기시간, 필요 마력 등
 * "피해량" 자체가 아닌 효과는 딜량 계산에 포함하지 않습니다.
 * ----------------------------------------------------------------------
 */

function getNumberInput(id) {
    const el = document.getElementById(id);
    const value = el ? parseFloat(el.value) : 0;
    return Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/* ==========================================================================
   기본 공격력 슬라이더 ↔ 숫자 입력 양방향 연동 (1 ~ 10,000)
   ========================================================================== */
function initBaseAtkControl() {
    const slider = document.getElementById("base-atk-slider");
    const input = document.getElementById("base-atk-input");
    if (!slider || !input) return;

    const clampAtk = (v) => clamp(Math.round(v), 1, 10000);

    slider.addEventListener("input", () => {
        input.value = slider.value;
    });
    input.addEventListener("input", () => {
        const v = parseInt(input.value, 10);
        if (Number.isFinite(v)) slider.value = clampAtk(v);
    });
    input.addEventListener("blur", () => {
        const v = clampAtk(parseInt(input.value, 10) || 1);
        input.value = v;
        slider.value = v;
    });
}

document.addEventListener("DOMContentLoaded", initBaseAtkControl);

function getBaseAttack() {
    const input = document.getElementById("base-atk-input");
    const v = input ? parseInt(input.value, 10) : 100;
    return clamp(Number.isFinite(v) ? v : 100, 1, 10000);
}

/* ==========================================================================
   공용 텍스트 파싱 헬퍼
   ========================================================================== */

// "+N%" 패턴 (보유효과류: "공격력 증폭 +40%")
function extractBonusPercent(text) {
    if (!text) return 0;
    const m = String(text).match(/\+\s*(\d+(?:\.\d+)?)\s*%/);
    return m ? parseFloat(m[1]) : 0;
}

// 문구 안의 모든 %를 뽑아 가장 큰 값을 반환 (스킬 자체 기본 피해 계수용)
function extractMaxPercent(text) {
    if (!text) return 0;
    const matches = String(text).match(/(\d+(?:\.\d+)?)\s*%/g) || [];
    if (!matches.length) return 0;
    return Math.max(...matches.map((m) => parseFloat(m)));
}

// "공격력 증폭 +N%" 또는 "공격력이 N% 증가/강화" 류 → 전역 공격력 보너스(%)
function extractGlobalAtkPercent(text) {
    if (!text) return 0;
    let total = 0;
    const re1 = /공격력\s*증폭\s*\+?\s*(\d+(?:\.\d+)?)\s*%/g;
    const re2 = /공격력이\s*(\d+(?:\.\d+)?)\s*%\s*(?:추가로\s*)?(?:증가|강화)/g;
    let m;
    while ((m = re1.exec(text))) total += parseFloat(m[1]);
    while ((m = re2.exec(text))) total += parseFloat(m[1]);
    return total;
}

// "장착한 OO 동료 하나 당 ~" / "장착한 OO 하나 당 ~" (동료 타입 개수 비례 효과)
function isCompanionCountScaledText(text) {
    if (!text) return false;
    return /장착한\s*\S+\s*(동료\s*)?하나\s*당/.test(text);
}

// "장착한 OO (동료) 하나 당 ~" 문구에서 OO(카운트 기준 단어)를 뽑아냄
function extractCompanionCountTypeWord(text) {
    if (!text) return null;
    const m = text.match(/장착한\s*(\S+?)\s*(?:동료\s*)?하나\s*당/);
    if (!m) return null;
    return m[1].replace(/^[\[\('"]+/, "").trim();
}

// 장착한 동료 중 typeWord와 일치하는 동료 수를 셈
// - companion.type[] (고양이/기계/디저트/음식/매콤/해적/고래/상어/늑대/그림자/구름/마법/닭/용/동물/고유 등)
// - companion.size (소형/중형/대형, 단일 문자열) 둘 다 확인합니다.
function companionTypeCount(equippedCompanions, typeWord) {
    if (!typeWord) return 0;
    return equippedCompanions.filter((c) => {
        const types = Array.isArray(c.type) ? c.type : (c.type ? [c.type] : []);
        if (types.includes(typeWord)) return true;
        if (c.size && c.size === typeWord) return true;
        return false;
    }).length;
}

// "OO 타입 스킬" 혹은 "OO, XX 타입 스킬"(콤마로 여러 타입 나열)에서 알려진 스킬 타입만 뽑아냄
function extractSkillTypeWordsMentioned(text, knownTypes) {
    const result = new Set();
    const re = /([가-힣]+(?:\s*,\s*[가-힣]+)*)\s*타입\s*스킬/g;
    let m;
    while ((m = re.exec(text))) {
        m[1].split(",").forEach((part) => {
            const w = part.trim();
            if (knownTypes.has(w)) result.add(w);
        });
    }
    return result;
}

// 텍스트 중 "피해/데미지/계수/증폭" 키워드 근처의 "N% 증가/강화" 값들을 모두 추출
// (치명타 피해 증폭 저항처럼 방어형 수치까지 잘못 잡지 않도록, 반드시
//  스킬 이름 또는 "OO 타입 스킬" 문맥이 확인된 텍스트에서만 호출합니다)
function extractDamageBonusPercents(text) {
    if (!text) return [];
    const results = [];
    const re = /(\d+(?:\.\d+)?)\s*%\s*(?:만큼\s*)?(?:추가로\s*)?(?:증가|강화)/g;
    let m;
    while ((m = re.exec(text))) {
        const windowStart = Math.max(0, m.index - 25);
        const before = text.slice(windowStart, m.index);
        if (/피해|데미지|계수|증폭/.test(before)) {
            results.push(parseFloat(m[1]));
        }
    }
    return results;
}

/* ==========================================================================
   장착 목록 조회 헬퍼
   ========================================================================== */
function getEquippedList(stateArray, dataArray) {
    if (!Array.isArray(stateArray) || !Array.isArray(dataArray)) return [];
    const out = [];
    stateArray.forEach((key) => {
        if (!key) return;
        const item = dataArray.find((x) => x.image === key);
        if (item) out.push(item);
    });
    return out;
}

function getEquippedSkillsList() {
    return getEquippedList(userState.equippedSkills, typeof skillData !== "undefined" ? skillData : []);
}

function getEquippedCompanionsList() {
    return getEquippedList(userState.equippedCompanions, typeof companionData !== "undefined" ? companionData : []);
}

function getEquippedRunesList() {
    // runeData는 메인/서브 룬이 하나로 합쳐진 배열이며 각 항목의
    // type 필드가 "main-rune" / "sub-rune"으로 구분됩니다 (rune.js 참고).
    const mainRunes = getEquippedList(userState.equippedMainRunes, typeof runeData !== "undefined" ? runeData : []);
    const subRunes = getEquippedList(userState.equippedSubRunes, typeof runeData !== "undefined" ? runeData : []);
    return mainRunes.concat(subRunes);
}

// 모든 스킬 데이터에서 등장하는 타입 태그 전체 집합 (동적으로 계산, "고유"도 포함되지만
// 텍스트에 "고유 타입 스킬"이라는 표현은 없으므로 매칭에 영향 없음)
function getKnownSkillTypes() {
    const all = typeof skillData !== "undefined" ? skillData : [];
    const set = new Set();
    all.forEach((s) => (s.type || []).forEach((t) => set.add(t)));
    return set;
}

/* ==========================================================================
   동료 성급 기준점 (12성 / 25성 / 25성 10각)
   ----------------------------------------------------------------------
   companion.json 구조상 "특수 효과"(special-effect)는 이미 Lv.3(만렙) 고정
   문구라 성급과 무관하게 항상 활성화되어 있다고 보고, "각성"(awaken)은
   25성을 찍어야 열리는 효과, "각성+10"(awaken+10)은 25성 + 10각을 찍어야
   열리는 (각성 효과를 대체하는) 상위 버전으로 취급합니다.
     - star12     : special-effect만 반영 (아직 각성 전)
     - star25     : special-effect + awaken 반영
     - star25_10  : special-effect + awaken+10 반영 (awaken 대신 적용됨)
   ========================================================================== */
const COMPANION_TIERS = [
    { id: "star12", label: "12성 기준" },
    { id: "star25", label: "25성 기준" },
    { id: "star25_10", label: "25성 10각 기준" },
];

/* ==========================================================================
   룬/동료 효과 문구 → 스킬별 피해 보너스 / 전역 공격력 보너스로 분해
   ========================================================================== */
function collectSynergySources(equippedRunes, equippedCompanions, companionTier) {
    // { label, text } 형태로 룬/동료의 모든 효과 문구를 한 군데로 모음
    const sources = [];

    equippedRunes.forEach((r) => {
        if (r.effect) sources.push({ label: ` [룬] ${r.name}`, text: r.effect });
    });

    equippedCompanions.forEach((c) => {
        // special-effect는 성급과 무관하게 항상 반영 (Lv.3 만렙 고정 문구)
        (c["special-effect"] || []).forEach((se) => {
            if (se && se.effect) sources.push({ label: ` [동료] ${c.name}`, text: se.effect });
        });

        if (companionTier === "star25" && c.awaken && c.awaken.effect) {
            sources.push({ label: ` [동료-각성] ${c.name}`, text: c.awaken.effect });
        }
        if (companionTier === "star25_10" && c["awaken+10"] && c["awaken+10"].effect) {
            sources.push({ label: ` [동료-각성+10] ${c.name}`, text: c["awaken+10"].effect });
        }
        // star12는 각성 전이므로 awaken/awaken+10 모두 미반영
    });

    return sources;
}

function computeSynergy(equippedSkills, equippedRunes, equippedCompanions, companionTier) {
    const knownTypes = getKnownSkillTypes();
    const sources = collectSynergySources(equippedRunes, equippedCompanions, companionTier);

    // skillKey(image) -> { skill, bonusPercent, breakdown: [{label, pct}] }
    const perSkillBonus = new Map();
    equippedSkills.forEach((s) => {
        perSkillBonus.set(s.image, { skill: s, bonusPercent: 0, breakdown: [] });
    });

    let globalAtkBonus = 0;
    const unresolvedNotes = []; // 그래도 자동으로 못 채운 문구 (패턴이 특이한 경우 등)

    // 이 문구가 실제로 어떤 장착 스킬(들)을 대상으로 하는지 찾아줌
    // - 스킬 이름이 직접 언급됨 → 그 스킬(들)
    // - "OO 타입 스킬" / "OO, XX 타입 스킬" 언급됨 → 해당 타입을 가진 장착 스킬 전원
    // - "모든 스킬"/"모든 피해량"/"치명타로 입히는 피해" 같은 전체형 문구 → 장착 스킬 전원
    function resolveTargetSkills(text) {
        const mentionedSkills = equippedSkills.filter((s) => s.name && text.includes(s.name));
        if (mentionedSkills.length > 0) return { targets: mentionedSkills, tag: "" };

        const matchedTypes = extractSkillTypeWordsMentioned(text, knownTypes);
        if (matchedTypes.size > 0) {
            const targets = [];
            matchedTypes.forEach((typeWord) => {
                equippedSkills
                    .filter((s) => (s.type || []).includes(typeWord))
                    .forEach((s) => targets.push(s));
            });
            return { targets, tag: ` (${Array.from(matchedTypes).join(", ")} 타입)` };
        }

        if (/모든\s*스킬|모든\s*피해량|치명타로\s*입히는\s*피해/.test(text)) {
            return { targets: equippedSkills.slice(), tag: " (전체)" };
        }

        return { targets: [], tag: "" };
    }

    sources.forEach(({ label, text }) => {
        if (!text) return;

        // 1) 동료 "타입"(종/크기) 개수에 비례하는 효과: 장착한 동료 중 몇 마리가 그 타입인지 세서 적용
        if (isCompanionCountScaledText(text)) {
            const countTypeWord = extractCompanionCountTypeWord(text);
            const count = companionTypeCount(equippedCompanions, countTypeWord);
            const pcts = extractDamageBonusPercents(text);

            if (count > 0 && pcts.length > 0) {
                const perUnitPct = Math.max(...pcts);
                const totalPct = perUnitPct * count;
                const { targets, tag } = resolveTargetSkills(text);

                if (targets.length > 0) {
                    targets.forEach((s) => {
                        const entry = perSkillBonus.get(s.image);
                        if (entry) {
                            entry.bonusPercent += totalPct;
                            entry.breakdown.push({
                                label: `${label} (${countTypeWord} 동료 ${count}마리 × ${perUnitPct}%)${tag}`,
                                pct: totalPct,
                            });
                        }
                    });
                } else {
                    // 스킬 이름/타입/전체형 문구 중 어디에도 안 걸리는 특이 케이스 → 그대로 안내만
                    unresolvedNotes.push({ label, text: `${text} (${countTypeWord} 동료 ${count}마리 장착 중이지만 적용 대상 스킬을 특정하지 못함)` });
                }
            }
            // count === 0(해당 타입 동료 미장착) 또는 %가 없는 효과(마력 감소 등)는
            // 보너스가 0이거나 딜량과 무관하므로 조용히 넘어갑니다.
            return;
        }

        // 2) 이 문구가 특정 장착 스킬 이름을 직접 언급하는지 확인
        const mentionedSkills = equippedSkills.filter((s) => s.name && text.includes(s.name));

        if (mentionedSkills.length > 0) {
            const pcts = extractDamageBonusPercents(text);
            if (pcts.length > 0) {
                const pct = Math.max(...pcts);
                mentionedSkills.forEach((s) => {
                    const entry = perSkillBonus.get(s.image);
                    if (entry) {
                        entry.bonusPercent += pct;
                        entry.breakdown.push({ label, pct });
                    }
                });
                return;
            }
            // 이름은 언급됐지만 피해%가 없는 효과(재사용 대기시간 감소, 튕김 횟수 등)는
            // 딜량 계산에 영향 없음 - 조용히 넘어갑니다.
        }

        // 3) "OO 타입 스킬" 식으로 타입만 언급된 경우 → 해당 타입의 장착 스킬 전원에게 적용
        const matchedTypes = extractSkillTypeWordsMentioned(text, knownTypes);
        if (matchedTypes.size > 0) {
            const pcts = extractDamageBonusPercents(text);
            if (pcts.length > 0) {
                const pct = Math.max(...pcts);
                matchedTypes.forEach((typeWord) => {
                    equippedSkills
                        .filter((s) => (s.type || []).includes(typeWord))
                        .forEach((s) => {
                            const entry = perSkillBonus.get(s.image);
                            if (entry) {
                                entry.bonusPercent += pct;
                                entry.breakdown.push({ label: `${label} (${typeWord} 타입)`, pct });
                            }
                        });
                });
                return;
            }
        }

        // 4) "공격력 증폭 +N%" 류 → 전역 공격력 보너스
        const atkPct = extractGlobalAtkPercent(text);
        if (atkPct > 0) {
            globalAtkBonus += atkPct;
            return;
        }

        // 5) 그 외(치명타 확률/저항, 재사용 대기시간, 마력, PVP 스탯 등)는 딜량 계산과 무관하므로 무시
    });

    return { perSkillBonus, globalAtkBonus, unresolvedNotes };
}

/* ==========================================================================
   한 성급 기준(tier)에 대해 전체 딜량 계산을 1회 수행
   ========================================================================== */
function runTierCalculation(tier, baseAtk, equippedSkills, equippedRunes, equippedCompanions) {
    // 1) 전역 공격력 보너스: 장착 스킬의 "보유효과"(+N%) + 장착 룬의 "보유효과"(+N%)
    let bonusPercent = 0;
    const bonusRows = [];

    equippedSkills.forEach((s) => {
        const pct = extractBonusPercent(s.holdEffect);
        if (pct > 0) {
            bonusPercent += pct;
            bonusRows.push({ label: ` ${s.name || "스킬"} (보유효과)`, value: `+${pct}%` });
        }
    });
    equippedRunes.forEach((r) => {
        const pct = extractBonusPercent(r.holdEffect);
        if (pct > 0) {
            bonusPercent += pct;
            bonusRows.push({ label: ` ${r.name || "룬"} (보유효과)`, value: `+${pct}%` });
        }
    });

    // 2) 룬/동료 효과 문구에서 스킬별 시너지 보너스 + 전역 공격력 보너스(%) 추가 추출
    //    (동료의 특수효과/각성 여부는 tier에 따라 달라짐 - collectSynergySources 참고)
    const { perSkillBonus, globalAtkBonus, unresolvedNotes } = computeSynergy(
        equippedSkills, equippedRunes, equippedCompanions, tier
    );
    if (globalAtkBonus > 0) {
        bonusPercent += globalAtkBonus;
        bonusRows.push({ label: ` 룬/동료 시너지 (공격력 증폭)`, value: `+${globalAtkBonus}%` });
    }

    const finalAtk = baseAtk * (1 + bonusPercent / 100);

    // 3) 스킬별 예상 피해량 = 최종 공격력 * (기본 피해 계수 + 시너지 보너스 계수) / 100
    let totalDamage = 0;
    const skillRows = [];
    equippedSkills.forEach((s) => {
                const baseCoeff = extractMaxPercent(s.effect);
                const synergy = perSkillBonus.get(s.image) || { bonusPercent: 0, breakdown: [] };
                const finalCoeff = baseCoeff + synergy.bonusPercent;
                const dmg = finalAtk * (finalCoeff / 100);
                totalDamage += dmg;

                const breakdownText = synergy.breakdown.length ?
                    ` (기본 ${baseCoeff}% + 시너지 ${synergy.bonusPercent}%: ${synergy.breakdown.map((b) => `${b.label} +${b.pct}%`).join(", ")})`
            : "";

        skillRows.push({
            label: `${s.name || "스킬"} (${finalCoeff}%)`,
            value: dmg.toLocaleString(undefined, { maximumFractionDigits: 0 }),
            breakdownText,
        });
    });

    return { bonusPercent, bonusRows, finalAtk, skillRows, totalDamage, unresolvedNotes };
}

function renderTierDetailHtml(tierLabel, result) {
    const unresolvedHtml = result.unresolvedNotes.length ? `
        <div class="deck-damage-unresolved">
            <span class="deck-damage-breakdown-label"> 반영되지 않은 효과 (${result.unresolvedNotes.length}개)</span>
            <p class="result-footnote" style="margin-top:4px;">
                동료 타입 개수는 세었지만, 이 효과가 어떤 스킬을 대상으로 하는지 문구에서
                특정하지 못해 딜량 계산에서 제외한 항목입니다.
            </p>
            <ul class="deck-damage-unresolved-list">
                ${result.unresolvedNotes.map((n) => `<li><b>${n.label}</b>: ${n.text}</li>`).join("")}
            </ul>
        </div>
    ` : "";

    return `
        <details class="deck-damage-tier-detail">
            <summary>${tierLabel} 상세 보기</summary>
            <div class="result-rows">
                <div class="result-row">
                    <span class="result-label">공격력 증폭 합계 (보유효과 + 룬/동료 시너지)</span>
                    <span class="result-value">+${result.bonusPercent.toFixed(1)}%</span>
                </div>
                <div class="result-row">
                    <span class="result-label">최종 공격력</span>
                    <span class="result-value">${result.finalAtk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
            </div>
            ${result.bonusRows.length ? `
            <div class="deck-damage-skill-breakdown">
                <span class="deck-damage-breakdown-label">공격력 증폭 상세</span>
                <div class="result-rows">
                    ${result.bonusRows.map((r) => `
                        <div class="result-row">
                            <span class="result-label">${r.label}</span>
                            <span class="result-value">${r.value}</span>
                        </div>
                    `).join("")}
                </div>
            </div>` : ""}
            ${result.skillRows.length ? `
            <div class="deck-damage-skill-breakdown">
                <span class="deck-damage-breakdown-label">스킬별 예상 피해량</span>
                <div class="result-rows">
                    ${result.skillRows.map((r) => `
                        <div class="result-row">
                            <span class="result-label">${r.label}${r.breakdownText}</span>
                            <span class="result-value">${r.value}</span>
                        </div>
                    `).join("")}
                </div>
            </div>` : ""}
            ${unresolvedHtml}
        </details>
    `;
}

/* ==========================================================================
   덱 구성 추천: 기본 공격력 + 룬/동료/스킬 보유효과·시너지로 최종 공격력을 구하고,
   12성 / 25성 / 25성 10각 세 기준점에서 예상 딜량을 각각 계산해 비교합니다.
   ========================================================================== */
function calcDeckDamage() {
    const baseAtk = getBaseAttack();

    const equippedSkills = getEquippedSkillsList();
    const equippedRunes = getEquippedRunesList();
    const equippedCompanions = getEquippedCompanionsList();

    const box = document.getElementById("deck-damage-result");
    if (!box) return;

    if (equippedSkills.length === 0) {
        box.innerHTML = `
            <div class="result-rows">
                <div class="result-row">
                    <span class="result-label">기본 공격력</span>
                    <span class="result-value">${baseAtk.toLocaleString()}</span>
                </div>
            </div>
            <p class="result-footnote"> 장착된 스킬이 없어서 예상 딜량은 계산할 수 없습니다. 4번 탭에서 스킬을 먼저 장착해주세요.</p>
        `;
        box.classList.remove("hidden");
        return;
    }

    // 성급 기준(12성/25성/25성 10각) 3개를 모두 계산
    const tierResults = COMPANION_TIERS.map((t) => ({
        id: t.id,
        label: t.label,
        result: runTierCalculation(t.id, baseAtk, equippedSkills, equippedRunes, equippedCompanions),
    }));

    const baselineDamage = tierResults[0].result.totalDamage; // 12성 기준을 100%로 놓고 비교

    const compareRowsHtml = tierResults.map(({ label, result }) => {
        const growth = baselineDamage > 0 ? ((result.totalDamage / baselineDamage) * 100) : 100;
        return `
            <div class="deck-damage-tier-col">
                <span class="deck-damage-tier-title">${label}</span>
                <span class="deck-damage-tier-atk">최종 공격력 ${result.finalAtk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span class="deck-damage-tier-dmg">${result.totalDamage.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span class="deck-damage-tier-growth">${growth.toFixed(0)}%${growth > 100 ? ` (12성 대비 ×${(growth / 100).toFixed(1)})` : ""}</span>
            </div>
        `;
    }).join("");

    // 성급 비교 카드/상세 접기 스타일은 main.css의
    // "18. 덱 구성 추천 - 성급 기준별 딜량 비교" 섹션에 정식으로 들어있습니다.
    box.innerHTML = `
        <div class="result-rows">
            <div class="result-row">
                <span class="result-label">기본 공격력</span>
                <span class="result-value">${baseAtk.toLocaleString()}</span>
            </div>
        </div>
        <div class="deck-damage-tier-compare">
            <span class="deck-damage-breakdown-label">성급 기준별 총 예상 딜량 비교</span>
            <div class="deck-damage-tier-cols">
                ${compareRowsHtml}
            </div>
        </div>
        <div class="deck-damage-tier-details">
            ${tierResults.map(({ label, result }) => renderTierDetailHtml(label, result)).join("")}
        </div>
        <p class="result-footnote"> 효과 문구를 자동으로 해석해 계산한 근사치입니다. 지속시간·타수·중첩·치명타 확률/피해·상태이상 부여 확률 등은 반영되지 않았습니다. "특수 효과"는 성급과 무관하게 항상 반영, "각성"은 25성부터, "각성+10"은 25성 10각부터 각성 대신 반영됩니다.</p>
    `;
    box.classList.remove("hidden");
}
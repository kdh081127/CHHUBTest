/**
 * simulate.js - 쿨타임 로테이션 기반 정밀 딜 시뮬레이터
 * ----------------------------------------------------------------------
 * calc.js의 "성급 기준별 딜량 비교"는 지속시간 없는 정적(static) 계산입니다.
 * 이 파일은 그 위에, 사용자가 알려준 실제 게임 규칙을 반영해서
 * "시간에 따라" 쿨타임·버프·디버프·중첩을 계산합니다.
 *
 *   - 스킬은 4번 탭에 장착한 슬롯 순서(1~6번)대로 계속 순환하며,
 *     각 슬롯을 확인할 때마다 0.05초씩 지나갑니다.
 *   - 슬롯의 스킬이 쿨타임이 다 됐으면 그 자리에서 즉시 시전하고
 *     (skills.json의 cooldown 값만큼) 재사용 대기를 시작합니다.
 *     쿨타임이 안 됐으면 그냥 다음 슬롯으로 넘어갑니다(0.05초만 소모).
 *   - 스킬/룬/동료의 효과 문구에서 "N초간/N초 동안 ~% 증가"처럼
 *     지속시간이 있는 버프·디버프를 찾아 시전 시점부터 지속시간 동안
 *     활성 보너스로 적용하고, 지속시간이 끝나면 자동으로 사라집니다.
 *   - "N% 확률로" 문구가 있으면 그 확률을 기댓값으로 곱해서 반영합니다
 *     (매 판정을 랜덤으로 굴리지 않고, 평균적인 기여도로 근사합니다).
 *   - "중첩 가능"/"최대 N중첩" 문구가 있으면 같은 발동원의 버프가
 *     동시에 여러 개 겹쳐 쌓이는 것도 반영합니다(상한 도달 시 지속시간만 갱신).
 *
 * ⚠️ 근사치인 부분 (오늘 범위 밖으로 남겨둔 것):
 *   - 공격속도 증가, 상태이상으로 인한 행동불가/이동불가 등은 반영하지 않습니다.
 *   - 스킬 자체 텍스트에 있는 자기 버프/디버프, 그리고 룬/동료의
 *     "OO 타입 스킬 시전 후 N초 동안 ~" 패턴은 "언제 발동하는지"가
 *     명확해서 정확히 시간 시뮬레이션합니다. 반면 발동 조건이 텍스트에서
 *     불명확한 룬/동료 효과(예: 특정 스킬 이름을 언급하지만 발동 시점이
 *     불분명한 경우)는 calc.js와 동일하게 "전투 내내 고정으로 적용"되는
 *     것으로 처리합니다(기존 성급 비교와 같은 근사).
 *   - "1초에 N번" 다단히트는 총 히트 수만큼을 시전 시점에 한꺼번에
 *     반영합니다(히트가 몇 초에 걸쳐 나뉘어 나가는 것까지는 아직 반영 X).
 * ----------------------------------------------------------------------
 */

/* ==========================================================================
   0. 텍스트 파싱 헬퍼 (calc.js의 extractBonusPercent 등과 같은 계열)
   ========================================================================== */

// "13.3초" 같은 cooldown 문자열 → 13.3 (숫자). 못 읽으면 기본값(10초)으로 대체.
function parseCooldownSeconds(cooldownStr) {
    if (!cooldownStr) return 10;
    const m = String(cooldownStr).match(/(\d+(?:\.\d+)?)\s*초/);
    return m ? parseFloat(m[1]) : 10;
}

// 스킬 자체의 "즉시 피해" 계수: "공격력 N%의 피해" / "공격력의 N% ... 피해" 패턴만 찾습니다.
// (버프 문구의 "OO이 N% 증가" 같은 수치와 섞이지 않도록 일부러 좁게 잡았습니다)
function extractBaseHitPercent(text) {
    if (!text) return 0;
    const re = /공격력\s*(?:의)?\s*(\d+(?:\.\d+)?)\s*%(?:\s*만큼|\s*의)?\s*(?:범위\s*)?피해/g;
    let m;
    let best = 0;
    while ((m = re.exec(text))) best = Math.max(best, parseFloat(m[1]));
    return best;
}

// "N초동안 ... 1초에 M번" → 총 히트 수(N*M). "1초에 M번"만 있으면 M, 그것도 없으면 1.
function extractHitCount(text) {
    if (!text) return 1;
    const durMatch = text.match(/(\d+(?:\.\d+)?)\s*초\s*(?:간|동안)/);
    const perSecMatch = text.match(/1\s*초에\s*(\d+)\s*번/);
    if (durMatch && perSecMatch) {
        return Math.max(1, Math.round(parseFloat(durMatch[1]) * parseInt(perSecMatch[1], 10)));
    }
    if (perSecMatch) return parseInt(perSecMatch[1], 10);
    const countMatch = text.match(/(\d+)\s*번\s*(?:던집니다|발사(?:합니다)?|입힙니다|타격)/);
    if (countMatch) return parseInt(countMatch[1], 10);
    return 1;
}

// "최대 N중첩" / "N회까지 중첩" / "중첩 가능"(상한 불명 → 5로 가정) → 최대 동시 중첩 수
function extractMaxStackCount(text) {
    if (!text) return 1;
    let m = text.match(/최대\s*(\d+)\s*(?:회|중첩)/);
    if (m) return parseInt(m[1], 10);
    m = text.match(/(\d+)\s*(?:회|번)까지\s*중첩/);
    if (m) return parseInt(m[1], 10);
    m = text.match(/중첩\s*\(?\s*최대\s*(\d+)/);
    if (m) return parseInt(m[1], 10);
    if (/중첩\s*가능/.test(text)) return 5; // 명시적 상한이 없을 때의 보수적 근사치
    return 1;
}

/* --------------------------------------------------------------------------
   버프/디버프 "적용 범위" 판정 — 스킬 이름이 아니라 타입/등급으로 범위가
   한정된 경우가 많아서(예: "모든 음식 스킬", "전설 이하 등급 스킬"), 범위를
   같이 뽑아둬야 다른 타입/등급 스킬에까지 잘못 적용되지 않습니다.
   -------------------------------------------------------------------------- */
const SKILL_GRADE_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const GRADE_KOREAN_TO_KEY = { "커먼": "common", "언커먼": "uncommon", "레어": "rare", "에픽": "epic", "전설": "legendary", "신화": "mythic" };

// "XX 타입 스킬" / "XX 타입의 스킬" / "모든 XX 스킬" → 타입 단어 (없으면 null = 범위 제한 없음)
function extractScopeTypeWord(windowText) {
    let m = windowText.match(/([가-힣]+)\s*타입(?:의)?\s*스킬/);
    if (m) return m[1];
    m = windowText.match(/모든\s*([가-힣]+)\s*스킬/);
    if (m && !GRADE_KOREAN_TO_KEY[m[1]]) return m[1]; // "모든 전설 스킬"처럼 등급형인 경우는 등급 스코프 쪽에서 처리
    return null;
}

// "OO 이하 (등급) 스킬" → 그 등급의 rank (없으면 null = 등급 제한 없음)
function extractScopeMaxGradeRank(windowText) {
    const m = windowText.match(/([가-힣]+)\s*이하\s*(?:등급\s*)?스킬/);
    if (!m) return null;
    const key = GRADE_KOREAN_TO_KEY[m[1]];
    return key ? SKILL_GRADE_RANK[key] : null;
}

// 이 버프/디버프 인스턴스가 지금 시전하는 스킬에 적용되는지 (타입/등급 범위 확인)
function buffAppliesToSkill(buff, skill) {
    if (buff.scopeTypeWord && !((skill.type || []).includes(buff.scopeTypeWord))) return false;
    if (buff.scopeMaxGradeRank != null) {
        const rank = SKILL_GRADE_RANK[skill.grade];
        if (rank === undefined || rank > buff.scopeMaxGradeRank) return false;
    }
    return true;
}

// 스킬 자신의 "본편 지속시간"(예: 파티 타임 10초, 벨루나의 가호 6초 등) — 자기 버프가
// 없어도, 다른 소스가 "이 스킬의 지속시간 동안 ~" 이라고 참조할 수 있어 별도로 뽑습니다.
function extractPrimaryDurationSeconds(text) {
    if (!text) return 0;
    const m = text.match(/(\d+(?:\.\d+)?)\s*초\s*(?:간|동안)/);
    return m ? parseFloat(m[1]) : 0;
}

// "지속시간이 N% 증가" / "지속시간이 N초 증가" / "지속시간이 N배(로) 증가" → {pct, addSec}
function extractDurationModifiers(text) {
    if (!text) return { pct: 0, addSec: 0 };
    let pct = 0;
    let addSec = 0;
    let m;
    const timesRe = /지속\s*시간(?:이|을)?\s*(\d+(?:\.\d+)?)\s*배(?:로)?\s*증가/g;
    while ((m = timesRe.exec(text))) pct += (parseFloat(m[1]) - 1) * 100;
    const pctRe = /지속\s*시간(?:이|을)?\s*(\d+(?:\.\d+)?)\s*%\s*증가/g;
    while ((m = pctRe.exec(text))) pct += parseFloat(m[1]);
    const secRe = /지속\s*시간(?:이|을)?\s*(\d+(?:\.\d+)?)\s*초\s*증가/g;
    while ((m = secRe.exec(text))) addSec += parseFloat(m[1]);
    return { pct, addSec };
}

// 룬/동료 효과 중 "OO 스킬의 지속시간 동안 XX 타입 스킬의 피해량이 N% 증가" 패턴
// (치명타 피해량은 이 계산기 범위 밖이라 제외합니다 - calc.js와 동일한 원칙)
function extractDurationGatedTypeBuffs(text) {
    if (!text) return [];
    const results = [];
    const re = /지속\s*시간\s*(?:동안|중)([\s\S]{0,80}?)([가-힣]+)\s*타입(?:의)?\s*(?:스킬)?[\s\S]{0,25}?(\d+(?:\.\d+)?)\s*%\s*(?:추가로\s*)?(?:증가|강화)/g;
    let m;
    while ((m = re.exec(text))) {
        const windowText = text.slice(Math.max(0, m.index - 5), m.index + m[0].length + 10);
        if (/치명타/.test(windowText)) continue;
        results.push({ typeWord: m[2], percent: parseFloat(m[3]) });
    }
    return results;
}

// 지속시간이 있는 자기 버프/디버프: 각 "N초간/N초 동안" 언급마다 그 뒤쪽에서
// "피해(량)?/데미지/공격력 ... N% 증가/강화"를 찾습니다. "받는 피해가 N% 감소" 같은
// 방어형(자신이 받는 피해를 줄이는) 효과는 우리 딜량 계산과 무관하므로 제외합니다.
function extractSelfTimedBuffs(text) {
    if (!text) return [];
    const results = [];
    const usedRanges = []; // 같은 %증가 문구가 여러 지속시간 언급에 중복으로 안 잡히게 방지
    const durRe = /(\d+(?:\.\d+)?)\s*초\s*(?:간|동안)/g;
    let dm;
    while ((dm = durRe.exec(text))) {
        const duration = parseFloat(dm[1]);
        const windowStart = dm.index;
        const windowEnd = Math.min(text.length, dm.index + 80);
        const windowText = text.slice(windowStart, windowEnd);

        const probMatch = windowText.match(/(\d+(?:\.\d+)?)\s*%\s*확률로/);
        const probability = probMatch ? parseFloat(probMatch[1]) / 100 : 1;

        const isDefensive = /받는\s*피해(량)?(이|가)?\s*\d+(?:\.\d+)?\s*%\s*감소/.test(windowText) && !/대상/.test(windowText);
        if (isDefensive) continue;

        const pctRe = /(?:피해량|피해|데미지|공격력)\s*(?:을|를|이|가)?\s*(\d+(?:\.\d+)?)\s*%\s*(?:만큼\s*)?(?:증가|강화)/;
        const pm = pctRe.exec(windowText);
        if (!pm) continue;

        const matchAbsIndex = windowStart + pm.index;
        const alreadyUsed = usedRanges.some((r) => Math.abs(r - matchAbsIndex) < 3);
        if (alreadyUsed) continue;
        usedRanges.push(matchAbsIndex);

        results.push({
            percent: parseFloat(pm[1]) * probability,
            durationSec: duration,
            probability,
            scopeTypeWord: extractScopeTypeWord(windowText),
            scopeMaxGradeRank: extractScopeMaxGradeRank(windowText),
            raw: windowText.trim().slice(0, 60),
        });
    }
    return results;
}

// "OO 스킬의 재사용 대기시간이 N% 감소" / "OO 스킬 쿨타임이 N% 감소" 패턴에서 감소율(%)만 추출
// (companion.json 동료 특수효과에 압도적으로 많은 패턴: "OO 스킬의 재사용 대기시간이 90% 감소합니다")
function extractCooldownReductionPercent(text) {
    if (!text) return 0;
    const re1 = /재사용\s*대(?:기\s*시|시\s*기)간이\s*(\d+(?:\.\d+)?)\s*%\s*감소/;
    const re2 = /쿨타임이\s*(\d+(?:\.\d+)?)\s*%\s*감소/;
    const m = text.match(re1) || text.match(re2);
    return m ? parseFloat(m[1]) : 0;
}

// 룬/동료 효과 문구 중 "OO 타입 스킬 시전 후 N초 동안 (최종) 피해량이 N% 증가" 패턴
// (rune-s.json에 특히 많이 나오는, 발동 조건이 명확한 구조화된 표현)
function extractTypeTriggeredBuffs(text) {
    if (!text) return [];
    const results = [];
    const re = /([가-힣]+)\s*타입\s*스킬\s*시전\s*후\s*(\d+(?:\.\d+)?)\s*초\s*(?:간|동안)\s*(?:최종\s*)?피해량이?\s*(\d+(?:\.\d+)?)\s*%\s*증가/g;
    let m;
    while ((m = re.exec(text))) {
        results.push({ typeWord: m[1], durationSec: parseFloat(m[2]), percent: parseFloat(m[3]) });
    }
    return results;
}

/* ==========================================================================
   1. 정적(static) 최종 공격력 + 스킬별 시너지 보너스 (calc.js 재사용)
   ========================================================================== */
function computeStaticFinalAtk(tier, baseAtk, equippedSkills, equippedRunes, equippedCompanions) {
    let bonusPercent = 0;
    equippedSkills.forEach((s) => { bonusPercent += extractBonusPercent(s.holdEffect); });
    equippedRunes.forEach((r) => { bonusPercent += extractBonusPercent(r.holdEffect); });

    const { perSkillBonus, globalAtkBonus } = computeSynergy(equippedSkills, equippedRunes, equippedCompanions, tier);
    bonusPercent += globalAtkBonus;

    const finalAtk = baseAtk * (1 + bonusPercent / 100);
    const perSkillStaticBonus = new Map();
    perSkillBonus.forEach((v, key) => perSkillStaticBonus.set(key, v.bonusPercent));
    return { finalAtk, perSkillStaticBonus };
}

// 장착 룬/동료(특수효과·각성 - tier에 따라 다름) 효과 문구를 훑어서, "OO 스킬의 재사용
// 대기시간이 N% 감소" 처럼 특정 장착 스킬 이름을 콕 집어 언급하는 쿨타임 감소를 모읍니다.
// (collectSynergySources가 이미 tier에 맞게 special-effect/awaken/awaken+10을 골라줍니다)
function computeCooldownReductionMap(equippedSkills, equippedRunes, equippedCompanions, companionTier) {
    const map = {}; // skill.image -> 누적 감소율(%)
    const sources = collectSynergySources(equippedRunes, equippedCompanions, companionTier);
    sources.forEach(({ text }) => {
        if (!text) return;
        const pct = extractCooldownReductionPercent(text);
        if (pct <= 0) return;
        equippedSkills
            .filter((s) => s.name && text.includes(s.name))
            .forEach((s) => {
                map[s.image] = (map[s.image] || 0) + pct;
            });
    });
    return map;
}

// 장착 룬/동료 효과 문구에서 "OO 스킬의 지속시간이 N%/N초/N배 증가" 패턴을 모아,
// 특정 스킬(이름 언급) 또는 특정 타입(예: "구름 타입 스킬의 지속시간이 N초 증가") 전체에
// 적용되는 지속시간 연장을 스킬별로 합산합니다. (연장된 지속시간은 자기 버프 유지시간과,
// 아래 buildDurationGateTriggers가 참조하는 "본편 지속시간 창"에 모두 반영됩니다)
function computeDurationExtensionMap(equippedSkills, equippedRunes, equippedCompanions, companionTier) {
    const map = {}; // skill.image -> { pct, addSec } 누적
    const addTo = (image, mod) => {
        if (!map[image]) map[image] = { pct: 0, addSec: 0 };
        map[image].pct += mod.pct;
        map[image].addSec += mod.addSec;
    };

    const sources = collectSynergySources(equippedRunes, equippedCompanions, companionTier);
    sources.forEach(({ text }) => {
        if (!text || !/지속\s*시간/.test(text)) return;
        const mod = extractDurationModifiers(text);
        if (mod.pct === 0 && mod.addSec === 0) return;

        // 이름이 명시된 스킬만 콕 집어 연장하는 경우
        const namedTargets = equippedSkills.filter((s) => s.name && text.includes(s.name));
        if (namedTargets.length > 0) {
            namedTargets.forEach((s) => addTo(s.image, mod));
            return;
        }

        // 이름 없이 "XX 타입 스킬의 지속시간이 ~" 처럼 타입 전체를 지정하는 경우
        const typeMatch = text.match(/([가-힣]+)\s*타입\s*스킬(?:의)?\s*지속\s*시간/);
        if (typeMatch) {
            const typeWord = typeMatch[1];
            equippedSkills
                .filter((s) => (s.type || []).includes(typeWord))
                .forEach((s) => addTo(s.image, mod));
        }
    });

    return map;
}

// 연장 맵을 적용한 최종 지속시간(초)을 계산. baseDurationSec이 0이면(=원래 지속시간 개념이 없는
// 스킬) 0을 그대로 반환합니다(연장할 대상 자체가 없음).
function applyDurationExtension(baseDurationSec, extensionMod) {
    if (!baseDurationSec) return 0;
    if (!extensionMod) return baseDurationSec;
    return baseDurationSec * (1 + extensionMod.pct / 100) + extensionMod.addSec;
}

// 룬/동료 효과 중 "OO 스킬의 지속시간 동안 XX 타입 스킬의 피해량이 N% 증가" 처럼, 다른(보통
// 장착 목록 안의) 스킬의 "본편 지속시간 창"이 열려 있는 동안에만 타입 스코프 보너스를 주는
// 경우를 찾습니다. gateSkill의 지속시간은 위 연장 맵까지 반영된 값을 사용합니다.
function buildDurationGateTriggers(equippedSkills, equippedRunes, equippedCompanions, companionTier, durationExtensionMap) {
    const gateTriggers = [];
    const sources = collectSynergySources(equippedRunes, equippedCompanions, companionTier);

    sources.forEach(({ label, text }) => {
        if (!text) return;
        const gateSkill = equippedSkills.find((s) => s.name && text.includes(s.name));
        if (!gateSkill) return; // 발동 조건(어떤 스킬의 지속시간인지)이 불명확하면 시간 반영 대상에서 제외

        const gated = extractDurationGatedTypeBuffs(text);
        if (!gated.length) return;

        const baseDur = extractPrimaryDurationSeconds(gateSkill.effect) || extractPrimaryDurationSeconds(gateSkill.holdEffect);
        const finalDur = applyDurationExtension(baseDur, durationExtensionMap[gateSkill.image]);
        if (finalDur <= 0) return; // 게이트 스킬 자체의 지속시간을 텍스트에서 못 읽으면 근사 불가 → 스킵(회귀 방지)

        gated.forEach((g) => {
            gateTriggers.push({
                gateSkillImage: gateSkill.image,
                gateDurationSec: finalDur,
                typeWord: g.typeWord,
                percent: g.percent,
                sourceLabel: `${label} (${gateSkill.name} 지속시간 동안 ${g.typeWord} 타입 스킬 피해 +${g.percent}%)`,
            });
        });
    });

    return gateTriggers;
}

/* ==========================================================================
   2. 버프/디버프 발동 트리거 목록 구성
   ========================================================================== */
function buildBuffTriggers(equippedSkills, equippedRunes, equippedCompanions, companionTier, durationExtensionMap) {
    const triggers = [];
    durationExtensionMap = durationExtensionMap || {};

    // 스킬 자신의 효과/보유효과 문구 속 자기 버프·디버프 (그 스킬을 시전하는 순간 발동)
    // - 디버프는 "대상"에게 적용되는 것이지만, 이 계산기는 단일 대상(보스 1체) 기준이라
    //   "내가 얻는 버프"와 수식적으로 동일하게 합산됩니다(대상이 여럿으로 갈리는 광역
    //   디버프 분산까지는 반영하지 않습니다).
    // - 룬 착용 여부에 따라 최대 중첩 수가 달라지는 경우(예: "OO의 [파괴] 최대 중첩이
    //   3배") 는 특정 룬 1개가 다른 스킬의 중첩 상한을 override하는 드문 케이스라 이번
    //   범위에서는 반영하지 않았습니다 (아래 함수 상단 주석 참고).
    equippedSkills.forEach((s) => {
                const buffs = extractSelfTimedBuffs(s.effect).concat(extractSelfTimedBuffs(s.holdEffect));
                const maxStack = Math.max(extractMaxStackCount(s.effect), extractMaxStackCount(s.holdEffect));
                const ext = durationExtensionMap[s.image];
                buffs.forEach((b) => {
                            const durationSec = applyDurationExtension(b.durationSec, ext) || b.durationSec;
                            triggers.push({
                                        groupKey: `skill:${s.image}:${b.durationSec}:${b.percent}`,
                                        maxStack,
                                        triggerType: "onCastSkill",
                                        triggerValue: s.image,
                                        percent: b.percent,
                                        durationSec,
                                        scopeTypeWord: b.scopeTypeWord,
                                        scopeMaxGradeRank: b.scopeMaxGradeRank,
                                        sourceLabel: `✨ ${s.name || "스킬"} 자체 효과${b.probability < 1 ? ` (${Math.round(b.probability * 100)}% 확률 기댓값 반영)` : ""}${ext && (ext.pct || ext.addSec) ? ` (지속시간 연장 반영: ${b.durationSec}초→${durationSec.toFixed(1)}초)` : ""}`,
            });
        });
    });

    // 룬/동료 효과 중 "OO 타입 스킬 시전 후 N초 동안 ~% 증가" (발동 조건이 명확한 것만 시간 반영)
    const sources = collectSynergySources(equippedRunes, equippedCompanions, companionTier);
    sources.forEach(({ label, text }) => {
        extractTypeTriggeredBuffs(text).forEach((b) => {
            triggers.push({
                groupKey: `type:${label}:${b.typeWord}:${b.durationSec}:${b.percent}`,
                maxStack: extractMaxStackCount(text),
                triggerType: "onCastType",
                triggerValue: b.typeWord,
                percent: b.percent,
                durationSec: b.durationSec,
                scopeTypeWord: null, // "시전 후" 버프는 시전한 사람이 다음에 뭘 쓰든 적용되는 범용 버프 (타입 스코프 없음)
                scopeMaxGradeRank: null,
                sourceLabel: `${label} (${b.typeWord} 타입 스킬 시전 후 발동)`,
            });
        });
    });

    return triggers;
}

// 같은 발동원(groupKey)의 버프가 이미 최대 중첩이면, 새로 쌓는 대신 가장 먼저
// 끝나는 인스턴스의 지속시간을 지금 시점부터 다시 시작하는 것으로 근사합니다.
function applyBuffInstance(activeBuffs, trigger, castTime) {
    const sameGroup = activeBuffs.filter((b) => b.groupKey === trigger.groupKey);
    if (sameGroup.length >= trigger.maxStack) {
        sameGroup.sort((a, b) => a.expiresAt - b.expiresAt);
        sameGroup[0].expiresAt = castTime + trigger.durationSec;
        return;
    }
    activeBuffs.push({
        groupKey: trigger.groupKey,
        percent: trigger.percent,
        expiresAt: castTime + trigger.durationSec,
        scopeTypeWord: trigger.scopeTypeWord,
        scopeMaxGradeRank: trigger.scopeMaxGradeRank,
        sourceLabel: trigger.sourceLabel,
    });
}

/* ==========================================================================
   3. 쿨타임 로테이션 시뮬레이션 (0.05초 간격, 슬롯 순서대로 순환)
   ========================================================================== */
function runDpsSimulation(durationSec, tier, baseAtk, equippedSkills, equippedRunes, equippedCompanions) {
    if (!equippedSkills.length) return null;
    const DELAY = 0.05;

    const { finalAtk, perSkillStaticBonus } = computeStaticFinalAtk(tier, baseAtk, equippedSkills, equippedRunes, equippedCompanions);

    // 동료 특수효과/각성(및 룬)에서 "OO 스킬의 재사용 대기시간이 N% 감소" 같은 걸 찾아
    // 실제 쿨타임에 반영합니다 → 시전 횟수가 늘고, 그만큼 자기 버프가 더 자주 갱신/중첩됩니다.
    const cdReductionMap = computeCooldownReductionMap(equippedSkills, equippedRunes, equippedCompanions, tier);

    // "OO 스킬의 지속시간이 N% 증가" 같은 지속시간 연장을 먼저 계산해두고, 자기 버프
    // 지속시간과 아래 게이트 트리거(다른 스킬의 지속시간 창 참조)에 모두 반영합니다.
    const durationExtensionMap = computeDurationExtensionMap(equippedSkills, equippedRunes, equippedCompanions, tier);
    const triggers = buildBuffTriggers(equippedSkills, equippedRunes, equippedCompanions, tier, durationExtensionMap);

    // "OO 스킬의 지속시간 동안 XX 타입 스킬의 피해량이 N% 증가" 처럼, 다른 스킬의 활성
    // 지속시간 창을 조건으로 거는 룬/동료 효과 (예: 벨루나/블레이즈/베스퍼류)
    const durationGateTriggers = buildDurationGateTriggers(equippedSkills, equippedRunes, equippedCompanions, tier, durationExtensionMap);
    const hasGateTriggers = durationGateTriggers.length > 0;

    const readyAt = {};
    const cooldownSec = {};
    const castCounts = {};
    equippedSkills.forEach((s) => {
        readyAt[s.image] = 0;
        const baseCd = parseCooldownSeconds(s.cooldown);
        const reductionPct = clamp(cdReductionMap[s.image] || 0, 0, 95); // 95%로 상한 (쿨타임 0초 근처로 가면 무한루프성 폭주 방지)
        cooldownSec[s.image] = baseCd * (1 - reductionPct / 100);
        castCounts[s.image] = 0;
    });

    let activeBuffs = [];
    let totalDamage = 0;
    let t = 0;
    let cursor = 0;
    const stackPeakByGroup = {};
    // gate 트리거가 참조하는 "본편 지속시간 창"이 열려 있는 스킬들 (image -> expiresAt)
    const activeWindows = {};
    const EPS = 1e-9;

    while (t <= durationSec + EPS) {
        const skill = equippedSkills[cursor % equippedSkills.length];

        if (readyAt[skill.image] <= t + EPS) {
            activeBuffs = activeBuffs.filter((b) => b.expiresAt > t);
            // 타입/등급 범위가 있는 버프·디버프는 지금 시전하는 스킬에 적용되는 것만 합산
            const activeBonusPct = activeBuffs
                .filter((b) => buffAppliesToSkill(b, skill))
                .reduce((sum, b) => sum + b.percent, 0);

            // 다른 스킬의 활성 지속시간 창을 조건으로 거는 게이트 보너스
            // (예: "벨루나의 가호 지속시간 동안 방어 타입 스킬 피해 +N%")
            const gateBonusPct = hasGateTriggers
                ? durationGateTriggers
                    .filter((g) => (activeWindows[g.gateSkillImage] || 0) > t + EPS && (skill.type || []).includes(g.typeWord))
                    .reduce((sum, g) => sum + g.percent, 0)
                : 0;

            const baseHitPct = extractBaseHitPercent(skill.effect);
            const hitCount = extractHitCount(skill.effect);
            const staticBonus = perSkillStaticBonus.get(skill.image) || 0;
            const finalCoeffPerHit = baseHitPct + staticBonus + activeBonusPct + gateBonusPct;
            const dmg = finalAtk * (finalCoeffPerHit / 100) * hitCount;

            totalDamage += dmg;
            castCounts[skill.image]++;

            // 이 스킬 자신의 "본편 지속시간"이 있으면(=다른 소스가 그 창을 게이트 조건으로
            // 참조할 수 있는 스킬이면) 연장된 값까지 반영해서 창을 엽니다.
            const primaryDur = extractPrimaryDurationSeconds(skill.effect) || extractPrimaryDurationSeconds(skill.holdEffect);
            if (primaryDur > 0) {
                const finalPrimaryDur = applyDurationExtension(primaryDur, durationExtensionMap[skill.image]);
                activeWindows[skill.image] = t + finalPrimaryDur;
            }

            triggers
                .filter((tr) => (
                    (tr.triggerType === "onCastSkill" && tr.triggerValue === skill.image) ||
                    (tr.triggerType === "onCastType" && (skill.type || []).includes(tr.triggerValue))
                ))
                .forEach((tr) => {
                    applyBuffInstance(activeBuffs, tr, t);
                    const cnt = activeBuffs.filter((b) => b.groupKey === tr.groupKey).length;
                    stackPeakByGroup[tr.groupKey] = Math.max(stackPeakByGroup[tr.groupKey] || 0, cnt);
                });

            readyAt[skill.image] = t + cooldownSec[skill.image];
        }

        t += DELAY;
        cursor++;
    }

    const dps = durationSec > 0 ? totalDamage / durationSec : 0;
    return { totalDamage, dps, durationSec, finalAtk, castCounts, triggers, stackPeakByGroup, cooldownSec, cdReductionMap, durationGateTriggers };
}

/* ==========================================================================
   4. 결과 렌더링 + 진입점
   ========================================================================== */
function renderSimulationDetailHtml(tierLabel, result) {
    if (!result) return "";

    const castRows = Object.keys(result.castCounts).map((image) => {
        const skill = (typeof skillData !== "undefined" ? skillData : []).find((s) => s.image === image);
        const reductionPct = (result.cdReductionMap && result.cdReductionMap[image]) || 0;
        const effectiveCd = result.cooldownSec ? result.cooldownSec[image] : null;
        return {
            name: skill ? skill.name : "스킬",
            count: result.castCounts[image],
            reductionPct,
            effectiveCd,
        };
    });

    const cdRows = castRows.filter((r) => r.reductionPct > 0);

    const gateRows = (result.durationGateTriggers || []).map((g) => g.sourceLabel);

    const stackRows = Object.keys(result.stackPeakByGroup)
        .filter((key) => result.stackPeakByGroup[key] > 1)
        .map((key) => {
            const tr = result.triggers.find((t) => t.groupKey === key);
            return { label: tr ? tr.sourceLabel : key, peak: result.stackPeakByGroup[key] };
        });

    return `
        <details class="deck-damage-tier-detail">
            <summary>${tierLabel} · ${result.durationSec}초 시뮬레이션 상세</summary>
            <div class="result-rows">
                <div class="result-row">
                    <span class="result-label">최종 공격력</span>
                    <span class="result-value">${result.finalAtk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">총 피해량 (${result.durationSec}초간)</span>
                    <span class="result-value">${result.totalDamage.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div class="result-row">
                    <span class="result-label">초당 평균 피해량 (DPS)</span>
                    <span class="result-value">${result.dps.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
            </div>
            <div class="deck-damage-skill-breakdown">
                <span class="deck-damage-breakdown-label">스킬별 시전 횟수 (쿨타임 기준)</span>
                <div class="result-rows">
                    ${castRows.map((r) => `
                        <div class="result-row">
                            <span class="result-label">${r.name}${r.reductionPct > 0 ? ` (쿨타임 ${r.effectiveCd.toFixed(1)}초, 동료 효과로 -${r.reductionPct}%)` : ""}</span>
                            <span class="result-value">${r.count}회</span>
                        </div>
                    `).join("")}
                </div>
            </div>
            ${cdRows.length ? `
            <div class="deck-damage-skill-breakdown">
                <span class="deck-damage-breakdown-label">동료/룬 효과로 감소한 쿨타임</span>
                <p class="result-footnote" style="margin-top:4px;">쿨타임이 짧아진 만큼 시전 횟수가 늘고, 그 스킬의 자체 버프가 더 자주 갱신·중첩됩니다.</p>
                <div class="result-rows">
                    ${cdRows.map((r) => `
                        <div class="result-row">
                            <span class="result-label">${r.name}</span>
                            <span class="result-value">-${r.reductionPct}%</span>
                        </div>
                    `).join("")}
                </div>
            </div>` : ""}
            ${stackRows.length ? `
            <div class="deck-damage-skill-breakdown">
                <span class="deck-damage-breakdown-label">최대로 겹쳤던 버프/디버프 중첩</span>
                <div class="result-rows">
                    ${stackRows.map((r) => `
                        <div class="result-row">
                            <span class="result-label">${r.label}</span>
                            <span class="result-value">최대 ${r.peak}중첩</span>
                        </div>
                    `).join("")}
                </div>
            </div>` : ""}
            ${gateRows.length ? `
            <div class="deck-damage-skill-breakdown">
                <span class="deck-damage-breakdown-label">지속시간 연동 효과 (다른 스킬의 지속시간 동안 발동)</span>
                <p class="result-footnote" style="margin-top:4px;">해당 스킬의 지속시간(연장 효과 반영)이 열려 있는 동안에만, 조건에 맞는 타입의 스킬에 보너스가 적용됩니다.</p>
                <div class="result-rows">
                    ${gateRows.map((label) => `
                        <div class="result-row">
                            <span class="result-label">${escapeHtml(label)}</span>
                        </div>
                    `).join("")}
                </div>
            </div>` : ""}
        </details>
    `;
}

function runDeckSimulation() {
    const baseAtk = getBaseAttack();
    const equippedSkills = getEquippedSkillsList();
    const equippedRunes = getEquippedRunesList();
    const equippedCompanions = getEquippedCompanionsList();

    const box = document.getElementById("deck-simulation-result");
    if (!box) return;

    if (equippedSkills.length === 0) {
        box.innerHTML = `<p class="result-footnote"> 장착된 스킬이 없어서 시뮬레이션을 실행할 수 없습니다. 4번 탭에서 스킬을 먼저 장착해주세요.</p>`;
        box.classList.remove("hidden");
        return;
    }

    const durationInput = document.getElementById("sim-duration-input");
    const rawDuration = durationInput ? parseFloat(durationInput.value) : 20;
    const durationSec = clamp(Number.isFinite(rawDuration) ? rawDuration : 20, 5, 60);
    if (durationInput) durationInput.value = durationSec;

    const tierResults = COMPANION_TIERS.map((t) => ({
        id: t.id,
        label: t.label,
        result: runDpsSimulation(durationSec, t.id, baseAtk, equippedSkills, equippedRunes, equippedCompanions),
    }));

    const baselineDps = tierResults[0].result.dps;
    const compareRowsHtml = tierResults.map(({ label, result }) => {
        const growth = baselineDps > 0 ? (result.dps / baselineDps) * 100 : 100;
        return `
            <div class="deck-damage-tier-col">
                <span class="deck-damage-tier-title">${label}</span>
                <span class="deck-damage-tier-atk">최종 공격력 ${result.finalAtk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span class="deck-damage-tier-dmg">${result.dps.toLocaleString(undefined, { maximumFractionDigits: 0 })} <small>DPS</small></span>
                <span class="deck-damage-tier-growth">${growth.toFixed(0)}%${growth > 100 ? ` (12성 대비 ×${(growth / 100).toFixed(1)})` : ""}</span>
            </div>
        `;
    }).join("");

    box.innerHTML = `
        <div class="deck-damage-tier-compare">
            <span class="deck-damage-breakdown-label">${durationSec}초 시뮬레이션 · 성급 기준별 DPS 비교</span>
            <div class="deck-damage-tier-cols">${compareRowsHtml}</div>
        </div>
        <div class="deck-damage-tier-details">
            ${tierResults.map(({ label, result }) => renderSimulationDetailHtml(label, result)).join("")}
        </div>
        <p class="result-footnote"> 4번 탭 스킬 슬롯 순서대로, 쿨타임이 되는 대로 0.05초 간격으로 자동 시전한다고 가정한 시뮬레이션입니다. 스킬·룬·동료 문구에서 지속시간·확률(기댓값)·중첩 상한을 읽어 버프/디버프를 시간에 따라 적용합니다. 공격속도 증가나 상태이상으로 인한 행동불가, 다단히트의 시간 분산까지는 아직 반영하지 않았습니다.</p>
    `;
    box.classList.remove("hidden");
}
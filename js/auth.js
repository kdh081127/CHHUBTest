/**
 * auth.js - Supabase 이메일/비밀번호 회원가입·로그인
 * ----------------------------------------------------------------------
 * - 로그인 상태는 Supabase가 브라우저에 자동으로 저장해두고, 새로고침해도
 *   유지됩니다 (onAuthStateChange로 감지).
 * - "빌드 저장"은 서버(Supabase)에 저장되는 데이터라 누구 것인지 구분이
 *   필요해서, 로그인해야만 쓸 수 있게 했습니다. build.js가 이 파일의
 *   getCurrentUser()를 사용합니다.
 * - supabaseClient가 아직 설정 안 됐으면(js/supabase-client.js 참고)
 *   "백엔드 미설정" 상태로 조용히 안내만 하고 나머지 사이트는 그대로
 *   동작합니다.
 * ----------------------------------------------------------------------
 */

let currentUser = null;
let authMode = "login"; // "login" | "signup"

function getCurrentUser() {
    return currentUser;
}

function escapeHtmlAuth(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

/* ==========================================================================
   0. 세션 초기화 / 감시
   ========================================================================== */
async function initAuth() {
    if (!supabaseClient) {
        renderAuthStatus();
        return;
    }
    try {
        const { data } = await supabaseClient.auth.getSession();
        currentUser = data && data.session ? data.session.user : null;
    } catch (err) {
        console.error("[auth.js] 세션 확인 실패:", err);
    }
    renderAuthStatus();
    document.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: currentUser } }));

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        currentUser = session ? session.user : null;
        renderAuthStatus();
        document.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: currentUser } }));
    });
}

/* ==========================================================================
   0-1. 로그인이 있어야만 쓸 수 있는 기능 막기
   ----------------------------------------------------------------------
   사이트 자체는 로그인 없이도 자유롭게 둘러볼 수 있습니다(탭 이동, 덱
   티어리스트 구경, 냥혼석 세공 시뮬레이션 등). 다만 아래 목록의 요소를
   "사용"하려는 클릭(장착 슬롯/피커, 프로필, 딜량 계산·시뮬레이션)만
   로그인이 없으면 막고 로그인 모달을 띄웁니다. (빌드 저장/불러오기는
   build.js 안에서 이미 로그인을 요구하고 있어 여기서 다시 막지 않습니다.)
   main.js/rune-equip.js/skill-equip.js를 이번에도 받지 못해서, 함수
   이름을 몰라도 되게 컨테이너를 클릭 단계(capture)에서 가로채는 방식을
   썼습니다.
   ========================================================================== */
const AUTH_GATED_CONTAINER_IDS = [
    "companion-slot-grid",
    "main-rune-slot-grid",
    "sub-rune-slot-grid",
    "skill-slot-grid",
    "soulstone-equip-slot",
    "companion-picker-grid",
    "rune-picker-grid",
    "skill-picker-grid",
    "soulstone-picker-grid",
    "profile-status",
    "deck-recommend-btn",
    "deck-simulate-btn",
];

function isInsideAuthGatedContainer(el) {
    return AUTH_GATED_CONTAINER_IDS.some((id) => {
        const container = document.getElementById(id);
        return container && (container === el || container.contains(el));
    });
}

document.addEventListener("click", function(event) {
    if (!supabaseClient || currentUser) return; // 백엔드 미설정 또는 이미 로그인 -> 그대로 통과
    if (!isInsideAuthGatedContainer(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    openAuthModal("login");
    const gateMsg = document.getElementById("auth-gate-msg");
    if (gateMsg) gateMsg.classList.remove("hidden");
}, true);

/* ==========================================================================
   1. 헤더 상태 표시
   ----------------------------------------------------------------------
   이메일은 개인정보라서, 프로필(서버+닉네임, profile.js)이 만들어진
   뒤에는 헤더에서 이메일을 숨기고 닉네임 배지만 보여줍니다. 프로필을
   아직 만들지 않은 첫 로그인 상태에서만, 어느 계정으로 로그인했는지
   확인할 수 있게 잠깐 이메일을 보여줍니다.
   ========================================================================== */
function renderAuthStatus() {
    const box = document.getElementById("auth-status");
    if (!box) return;

    if (!supabaseClient) {
        box.innerHTML = `<span class="auth-status-warning" title="js/supabase-client.js에 SUPABASE_URL/ANON_KEY를 설정해주세요">백엔드 미설정</span>`;
        return;
    }

    if (currentUser) {
        const hasProfile = typeof getMyProfile === "function" && !!getMyProfile();
        box.innerHTML = `
            ${hasProfile ? "" : `<span class="auth-status-email">${escapeHtmlAuth(currentUser.email || "")}</span>`}
            <button type="button" class="btn-auth-action" onclick="signOutUser()">로그아웃</button>
        `;
    } else {
        box.innerHTML = `<button type="button" class="btn-auth-action btn-auth-primary" onclick="openAuthModal('login')">로그인 / 회원가입</button>`;
    }
}

// profile.js가 내 프로필을 불러오거나 저장할 때마다 "profileChanged"를 쏩니다
// (profile.js 참고) - 그 시점에 이메일 표시 여부를 다시 계산합니다.
document.addEventListener("profileChanged", renderAuthStatus);

/* ==========================================================================
   2. 모달 열기/닫기/전환
   ========================================================================== */
function openAuthModal(mode) {
    authMode = mode || "login";
    const modal = document.getElementById("auth-modal");
    if (modal) modal.classList.remove("hidden");
    updateAuthModalMode();
    setAuthError("");
    const emailInput = document.getElementById("auth-email-input");
    const passwordInput = document.getElementById("auth-password-input");
    if (emailInput) emailInput.value = "";
    if (passwordInput) passwordInput.value = "";
    // 기능 사용 시도로 인해 뜬 안내문("로그인 후 이용 가능")은, 헤더의
    // "로그인 / 회원가입" 버튼처럼 직접 연 경우에는 보이지 않아야 합니다.
    const gateMsg = document.getElementById("auth-gate-msg");
    if (gateMsg) gateMsg.classList.add("hidden");
}

function closeAuthModal() {
    const modal = document.getElementById("auth-modal");
    if (modal) modal.classList.add("hidden");
}

function switchAuthMode() {
    authMode = authMode === "login" ? "signup" : "login";
    updateAuthModalMode();
    setAuthError("");
}

function updateAuthModalMode() {
    const title = document.getElementById("auth-modal-title");
    const submitBtn = document.getElementById("auth-submit-btn");
    const switchLink = document.getElementById("auth-switch-mode-link");
    const passwordHint = document.getElementById("auth-password-hint");
    if (authMode === "login") {
        if (title) title.textContent = "로그인";
        if (submitBtn) submitBtn.textContent = "로그인";
        if (switchLink) switchLink.textContent = "계정이 없으신가요? 회원가입";
        // 로그인할 때는 이미 정해진 비밀번호를 입력하는 것뿐이라 규칙 안내가
        // 필요 없습니다 - 회원가입할 때만 보여줍니다.
        if (passwordHint) passwordHint.classList.add("hidden");
    } else {
        if (title) title.textContent = "회원가입";
        if (submitBtn) submitBtn.textContent = "회원가입";
        if (switchLink) switchLink.textContent = "이미 계정이 있으신가요? 로그인";
        if (passwordHint) passwordHint.classList.remove("hidden");
    }
}

/* ==========================================================================
   3. 제출 (로그인/회원가입 공용)
   ========================================================================== */
async function submitAuthForm() {
    if (!supabaseClient) {
        setAuthError("백엔드(Supabase)가 아직 설정되지 않았습니다. js/supabase-client.js를 확인해주세요.");
        return;
    }
    const email = ((document.getElementById("auth-email-input") || {}).value || "").trim();
    const password = (document.getElementById("auth-password-input") || {}).value || "";

    if (!email || !password) {
        setAuthError("이메일과 비밀번호를 모두 입력해주세요.");
        return;
    }
    if (password.length < 6) {
        setAuthError("비밀번호는 6자 이상이어야 합니다.");
        return;
    }

    setAuthError("");
    const submitBtn = document.getElementById("auth-submit-btn");
    if (submitBtn) submitBtn.disabled = true;

    try {
        if (authMode === "login") {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            closeAuthModal();
        } else {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            // Supabase 프로젝트 설정(Confirm email)에 따라 가입 즉시 로그인되는 경우와
            // 이메일 인증이 필요한 경우가 갈립니다 - session 유무로 구분해서 안내합니다.
            if (data && data.session) {
                closeAuthModal();
            } else {
                alert("회원가입 완료! 이메일로 온 인증 링크를 눌러야 로그인할 수 있습니다.");
                authMode = "login";
                updateAuthModalMode();
            }
        }
    } catch (err) {
        setAuthError(translateAuthError(err));
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function setAuthError(msg) {
    const el = document.getElementById("auth-error-msg");
    if (el) el.textContent = msg || "";
}

// Supabase 에러 메시지를 아는 범위 내에서만 한국어로 바꿔줍니다. 모르는 메시지를
// 억지로 번역하지 않고 원문 그대로 보여줍니다(잘못 안내하는 것을 막기 위함).
function translateAuthError(err) {
    const msg = (err && err.message) || String(err);
    const known = {
        "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
        "User already registered": "이미 가입된 이메일입니다.",
        "Email not confirmed": "이메일 인증이 필요합니다. 받은 편지함을 확인해주세요.",
        "Password should be at least 6 characters": "비밀번호는 6자 이상이어야 합니다.",
    };
    if (known[msg]) return known[msg];

    // Supabase 프로젝트의 "비밀번호 강도" 설정(Auth > Policies > Password Requirements)에서
    // 대/소문자·숫자·특수문자를 모두 요구하도록 되어 있으면 이런 영어 메시지가 그대로
    // 옵니다. 정확한 문구는 프로젝트 설정에 따라 조금씩 달라질 수 있어서, 메시지
    // 시작 부분("Password should contain...")으로 감지해서 한국어로 바꿔줍니다.
    if (/^Password should contain/i.test(msg)) {
        return "비밀번호는 영문 대문자, 영문 소문자, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다.";
    }
    return msg;
}

async function signOutUser() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
}

document.addEventListener("DOMContentLoaded", initAuth);
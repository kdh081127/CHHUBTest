/**
 * profile.js - 프로필(서버 + 닉네임)
 * ----------------------------------------------------------------------
 * 회원가입/로그인은 auth.js가 담당하고, 이 파일은 그 위에 "이 계정이 어느
 * 서버의 누구인지"를 profiles 테이블(supabase-setup.sql)에 저장합니다.
 *
 * - 닉네임은 같은 서버 안에서만 중복을 막습니다(서버가 다르면 같은 닉네임을
 *   써도 됩니다). 대소문자 구분 없이 비교합니다.
 * - 로그인했는데 아직 프로필이 없으면(첫 로그인) 자동으로 설정 모달을 띄우고,
 *   프로필을 저장하기 전에는 닫을 수 없게 했습니다.
 * - auth.js가 로그인/로그아웃마다 쏘는 "authStateChanged" 이벤트를 듣고
 *   내 프로필을 다시 불러옵니다.
 * - 프로필이 바뀌면 "profileChanged" 이벤트를 쏩니다 - 나중에 덱 순위 등
 *   닉네임이 필요한 다른 기능에서 이걸 듣고 갱신하면 됩니다.
 * ----------------------------------------------------------------------
 */

let myProfile = null; // { user_id, server, nickname } | null

function getMyProfile() {
    return myProfile;
}

function escapeHtmlProfile(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

/* ==========================================================================
   0. 내 프로필 불러오기
   ========================================================================== */
async function loadMyProfile() {
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;

    if (!supabaseClient || !user) {
        myProfile = null;
        renderProfileStatus();
        closeProfileModalForce();
        return;
    }

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("user_id, server, nickname")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        console.error("[profile.js] 프로필을 불러오지 못했습니다:", error);
        myProfile = null;
    } else {
        myProfile = data || null;
    }

    renderProfileStatus();

    // 로그인은 했는데 프로필이 아직 없으면(첫 로그인) 바로 설정하도록 안내합니다.
    if (user && !myProfile) {
        openProfileModal();
    }
}

/* ==========================================================================
   1. 헤더에 표시
   ========================================================================== */
function renderProfileStatus() {
    const box = document.getElementById("profile-status");
    if (!box) return;

    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (!supabaseClient || !user) {
        box.innerHTML = "";
        return;
    }

    if (myProfile) {
        box.innerHTML = `
            <button type="button" class="btn-auth-action profile-badge" onclick="openProfileModal()" title="프로필 수정">
                ${escapeHtmlProfile(myProfile.server)}서버 · ${escapeHtmlProfile(myProfile.nickname)}
            </button>
        `;
    } else {
        box.innerHTML = `<button type="button" class="btn-auth-action btn-auth-primary" onclick="openProfileModal()">프로필 설정</button>`;
    }
}

/* ==========================================================================
   2. 프로필 설정 모달
   ========================================================================== */
function openProfileModal() {
    const modal = document.getElementById("profile-modal");
    if (modal) modal.classList.remove("hidden");
    setProfileError("");

    const serverInput = document.getElementById("profile-server-input");
    const nicknameInput = document.getElementById("profile-nickname-input");
    if (serverInput) serverInput.value = myProfile ? myProfile.server : "";
    if (nicknameInput) nicknameInput.value = myProfile ? myProfile.nickname : "";

    // 프로필이 아직 없으면(첫 설정) 닫기 버튼을 숨겨서 반드시 저장하게 합니다.
    const closeBtn = document.getElementById("profile-modal-close-btn");
    if (closeBtn) closeBtn.classList.toggle("hidden", !myProfile);
}

function closeProfileModal() {
    // 프로필이 아직 없는 상태(첫 설정 강제)에서는 닫기를 막습니다.
    if (!myProfile) return;
    const modal = document.getElementById("profile-modal");
    if (modal) modal.classList.add("hidden");
}

// 로그아웃 등으로 강제로 닫아야 할 때(사용자 취소가 아닐 때) 쓰는 내부용 닫기
function closeProfileModalForce() {
    const modal = document.getElementById("profile-modal");
    if (modal) modal.classList.add("hidden");
}

function setProfileError(msg) {
    const el = document.getElementById("profile-error-msg");
    if (el) el.textContent = msg || "";
}

/* ==========================================================================
   3. 저장 (서버+닉네임 중복 확인 -> upsert)
   ========================================================================== */
async function submitProfileForm() {
    const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    if (!supabaseClient || !user) {
        setProfileError("로그인이 필요합니다.");
        return;
    }

    const server = ((document.getElementById("profile-server-input") || {}).value || "").trim();
    const nickname = ((document.getElementById("profile-nickname-input") || {}).value || "").trim();

    if (!server || !nickname) {
        setProfileError("서버와 닉네임을 모두 입력해주세요.");
        return;
    }
    if (nickname.length > 12) {
        setProfileError("닉네임은 12자 이하로 입력해주세요.");
        return;
    }

    const submitBtn = document.getElementById("profile-submit-btn");
    if (submitBtn) submitBtn.disabled = true;
    setProfileError("");

    try {
        // 같은 서버에 이미 그 닉네임을 쓰는 "다른" 사람이 있는지 먼저 확인합니다
        // (대소문자 구분 없이 비교). 내가 이미 그 닉네임의 주인이면 통과시킵니다.
        const { data: existing, error: checkError } = await supabaseClient
            .from("profiles")
            .select("user_id")
            .eq("server", server)
            .ilike("nickname", nickname);

        if (checkError) throw checkError;

        const takenByOther = (existing || []).some((row) => row.user_id !== user.id);
        if (takenByOther) {
            setProfileError(`${server}서버에 이미 "${nickname}" 닉네임이 있습니다. 다른 닉네임을 입력해주세요.`);
            return;
        }

        const { error: upsertError } = await supabaseClient
            .from("profiles")
            .upsert({ user_id: user.id, server, nickname, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

        if (upsertError) {
            // 23505 = Postgres 유니크 제약 위반. 위에서 미리 확인했지만, 그 사이에
            // 다른 사람이 먼저 같은 닉네임을 저장했을 수도 있는 경우를 대비한
            // 최종 안전장치입니다.
            if (upsertError.code === "23505") {
                setProfileError(`${server}서버에 이미 "${nickname}" 닉네임이 있습니다. 다른 닉네임을 입력해주세요.`);
            } else {
                throw upsertError;
            }
            return;
        }

        myProfile = { user_id: user.id, server, nickname };
        renderProfileStatus();
        closeProfileModalForce();
        document.dispatchEvent(new CustomEvent("profileChanged", { detail: { profile: myProfile } }));
    } catch (err) {
        console.error("[profile.js] 프로필 저장 실패:", err);
        setProfileError("프로필을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

/* ==========================================================================
   4. 로그인 상태 변화 감지 (auth.js가 dispatch하는 이벤트)
   ========================================================================== */
document.addEventListener("authStateChanged", loadMyProfile);
document.addEventListener("DOMContentLoaded", loadMyProfile);
/**
 * supabase-client.js - Supabase 프로젝트 연결 설정
 * ----------------------------------------------------------------------
 * ⚠️ 아래 SUPABASE_URL / SUPABASE_ANON_KEY를 본인 Supabase 프로젝트 값으로
 * 바꿔주세요. 두 값 모두 Supabase 대시보드 > Project Settings > API 에서
 * 확인할 수 있습니다 (Project URL / anon public key).
 *
 * anon key는 "공개돼도 되는" 키입니다 (비밀번호가 아닙니다) — 실제 접근 제어는
 * Supabase의 Row Level Security(RLS) 정책이 담당합니다. 이 값을 채우기 전에
 * 먼저 supabase-setup.sql을 Supabase SQL Editor에서 실행해서 RLS를 켜두세요.
 *
 * index.html은 이 파일보다 먼저 supabase-js 라이브러리를(CDN) 불러옵니다.
 * ----------------------------------------------------------------------
 */
const SUPABASE_URL = "https://ulnkpwurbclaaokpgfmf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bWcZZw9QlPaIZJ-jsBO7xw_tQomjSWE";

let supabaseClient = null;

(function initSupabaseClient() {
    const isConfigured = SUPABASE_URL.startsWith("https://") &&
        !SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
        SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR-ANON-PUBLIC-KEY");

    if (!isConfigured) {
        console.warn(
            "[supabase-client.js] SUPABASE_URL / SUPABASE_ANON_KEY가 아직 설정되지 않았습니다. " +
            "js/supabase-client.js 상단의 두 값을 본인 Supabase 프로젝트 값으로 바꿔주세요. " +
            "그 전까지는 로그인/빌드 저장 기능이 비활성화된 채로 표시됩니다."
        );
        return;
    }

    if (typeof supabase === "undefined" || typeof supabase.createClient !== "function") {
        console.error("[supabase-client.js] supabase-js 라이브러리를 찾을 수 없습니다. index.html의 CDN 스크립트 태그를 확인해주세요.");
        return;
    }

    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("[supabase-client.js] Supabase 클라이언트 초기화 완료");
})();
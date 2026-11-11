// 공유 모드(Supabase) 연결 정보. 두 값을 채우면 모두가 같은 달력을 보고, 로그인한 관리자만 고칠 수 있다.
// 비워 두면 체험 모드(이 브라우저에만 저장)로 돈다.
//
// 값은 Supabase 대시보드 → Project Settings → API Keys 에 있다.
//   url     : https://<Project ID>.supabase.co     예) https://abcdefghijkl.supabase.co
//   anonKey : Publishable key (sb_publishable_… 로 시작). 예전 이름은 anon public(eyJ… 로 시작)이며 둘 다 된다.
// 이 키는 공개용이라 GitHub 에 올라가도 괜찮다. Secret / service_role 키는 절대 여기에 넣지 말 것.
export const SUPABASE = {
  url: 'https://xmehoqugngrdfhxdicvl.supabase.co',
  anonKey: 'sb_publishable_hYoixBZ-MJVSYnCzwQHr7A_D7lYLSSl',
};

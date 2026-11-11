// 해시(#/...) 주소. 경로(/calendar)로 하면 정적 호스팅이 404 를 주고, 로그인 왕복에도 해시는 그대로 남는다.
// 화면마다 주소가 따로 있다(#/calendar, #/auto/payroll-notice …). 링크를 그대로 건네줄 수 있고, 뒤로가기가 앱 안에서 돈다.
const PLAIN = new Set(['home', 'calendar', 'auto', 'hire', 'cert', 'staff', 'eval', 'org', 'to']);
// 자동화 업무 하나를 보는 주소: #/auto/<id>  → 화면 이름 'auto:<id>'
const AUTOS = new Set(['payroll-notice', 'longservice-mail']);

// 'calendar' → '#/calendar',  'auto:payroll-notice' → '#/auto/payroll-notice'
export function hashOf(view) {
  const v = String(view ?? 'home');
  if (v === 'home') return '#/';
  if (v.startsWith('auto:')) {
    const id = v.slice(5);
    return AUTOS.has(id) ? `#/auto/${id}` : '#/auto';
  }
  return PLAIN.has(v) ? `#/${v}` : '#/';
}

// '#/calendar' → 'calendar',  '#/auto/payroll-notice' → 'auto:payroll-notice'. 모르는 주소는 홈으로 보낸다.
// 조직도·TO표는 '#/org?tab=<맨 위 조직 id>' 처럼 물음표 뒤에 탭을 달 수 있다(홈 카드가 쓴다).
export function viewOf(hash) {
  const raw = String(hash ?? '').replace(/^#/, '').replace(/^\//, '').split('?')[0];
  if (!raw) return 'home';
  const [head, ...rest] = raw.split('/').filter(Boolean);
  if (head === 'auto' && rest.length === 1 && AUTOS.has(rest[0])) return 'auto:' + rest[0];
  if (rest.length) return 'home';
  return PLAIN.has(head) ? head : 'home';
}

// 해시 뒤의 물음표 값. '#/org?tab=u_x' → { tab: 'u_x' }
export function hashQuery(hash) {
  const at = String(hash ?? '').indexOf('?');
  return at < 0 ? new URLSearchParams() : new URLSearchParams(String(hash).slice(at + 1));
}

export const AUTO_IDS = [...AUTOS];

// 자동화 화면이 쓰는 글·날짜 계산. DOM 을 모르는 순수 함수만 둔다.
// 문구 틀의 자리표시자는 {{이름}} 꼴이다. 둘레 공백은 되고({{ 이름 }}), 이름 안의 공백은 안 된다.
import { pad } from './repeat.js';

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH = /^\d{4}-\d{2}$/;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export const todayYmd = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
export const thisMonth = () => todayYmd().slice(0, 7);

// '2026-11-09' → '2026년 11월 9일'
const 날짜조각 = /^(\d{4})-(\d{2})-(\d{2})$/;
export function 날짜글(ymd) {
  const m = 날짜조각.exec(String(ymd ?? '').trim());
  if (!m) return '';
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

// '2026-11-25' → '수'
export function 요일글(ymd) {
  if (!DATE.test(String(ymd ?? ''))) return '';
  return DOW[new Date(ymd + 'T00:00:00').getDay()];
}

// '2026-11-25' → '11월 25일(수)'
export function 짧은날짜(ymd) {
  if (!DATE.test(String(ymd ?? ''))) return '';
  return `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일(${요일글(ymd)})`;
}

// 재직기간. 끝이 없으면 '현재'.
export function 기간글(from, to) {
  const a = 날짜글(from);
  if (!a) return '';
  return `${a} ~ ${날짜글(to) || '현재'}`;
}

// '2026-11' → '2026년 11월'
export const monthLabel = (month) => (MONTH.test(month ?? '') ? `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월` : '');
// '2026-11' → ['2026-11-01', '2026-11-30']
export function monthRange(month) {
  if (!MONTH.test(month ?? '')) return ['', ''];
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return [`${month}-01`, `${month}-${pad(new Date(y, m, 0).getDate())}`];
}
export function shiftMonth(month, n) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const d = new Date(y, m, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

// 입사일까지: 'D-7', '오늘', '입사 6일 지남'. 날짜가 아니면 빈 글자.
export function dday(ymd, today = todayYmd()) {
  if (!DATE.test(String(ymd ?? ''))) return '';
  const days = Math.round((new Date(ymd + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (days === 0) return '오늘';
  return days > 0 ? `D-${days}` : `입사 ${-days}일 지남`;
}

// 연락처: 숫자만 보고 하이픈을 넣는다. 11자리를 넘는 숫자는 버린다. 10자리(옛 번호)는 3-3-4.
export function formatPhone(text) {
  const d = String(text ?? '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 'YYYY-MM-DDTHH:MM…' → '11.06 16:46'(이 컴퓨터 시간)
export function stamp(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${pad(at.getMonth() + 1)}.${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

// 숫자에 쉼표. '500000' → '500,000'
export const comma = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------- 문구 틀 채우기 ----------
const HOLE = /\{\{\s*([^}\s]+)\s*\}\}/g;

// 틀에 값을 채운다. 없는 값은 {{이름}} 그대로 남긴다(무엇이 비었는지 보이게).
export function fill(template, values) {
  return String(template ?? '').replace(HOLE, (whole, key) => (Object.hasOwn(values ?? {}, key) && values[key] !== undefined && values[key] !== null ? String(values[key]) : whole));
}

// 채우지 못한 자리 이름들.
export function missingKeys(template, values) {
  const out = [];
  for (const m of String(template ?? '').matchAll(HOLE)) {
    const key = m[1];
    if (!Object.hasOwn(values ?? {}, key) || values[key] === '' || values[key] === undefined) out.push(key);
  }
  return [...new Set(out)];
}

// 모든 문구가 같이 쓰는 회사 값.
export function companyValues(settings) {
  const c = settings?.company ?? {};
  return {
    회사: c.short || c.name || '', 회사명: c.name || '', 주소: c.address || '',
    인사팀: c.hr_team || '인사팀', 담당자연락처: c.contact_phone || '', 인사메일: c.hr_mail || '',
  };
}

// ---------- 급여 공지 ----------
// corp: { label, ot_from, ot_to, ot_prev }  month: 'YYYY-MM'  payday: 'YYYY-MM-DD'
export function payrollValues({ corp, month, payday, manager, settings }) {
  const [from, to] = monthRange(month);
  const otStartMonth = corp?.ot_prev === false ? month : shiftMonth(month, -1);
  const dayOf = (m, d) => (d === '말일' || d === 'last' ? monthRange(m)[1] : `${m}-${pad(Number(d) || 1)}`);
  return {
    ...companyValues(settings),
    법인: corp?.label || '',
    귀속월: monthLabel(month),
    짧은귀속월: MONTH.test(month ?? '') ? `${month.slice(2, 4)}년 ${Number(month.slice(5, 7))}월` : '',
    귀속달: MONTH.test(month ?? '') ? `${Number(month.slice(5, 7))}월` : '',
    귀속기간: from ? `${from} ~ ${to}` : '',
    짧은귀속기간: from ? `${Number(month.slice(5, 7))}/1 - ${Number(month.slice(5, 7))}/${Number(to.slice(8, 10))}` : '',
    연장근무기간: MONTH.test(month ?? '') ? `${dayOf(otStartMonth, corp?.ot_from ?? 21)} ~ ${dayOf(month, corp?.ot_to ?? 20)}` : '',
    지급일: 짧은날짜(payday),
    담당자: manager || '',
  };
}

// ---------- 장기근속 ----------
// 직원명부에서 그 달에 근속 N년이 되는 사람. grants: [{ years, amount, leave }]
// 돌려주는 것: [{ name, email, joined, years, amount, leave, day, skip }]
export function longServiceTargets(staff, month, grants) {
  if (!MONTH.test(month ?? '')) return [];
  const y = Number(month.slice(0, 4));
  const m = month.slice(5, 7);
  const table = new Map((grants ?? []).map((g) => [Number(g.years), g]).filter(([n]) => n > 0));
  const out = [];
  for (const s of staff ?? []) {
    const joined = String(s.joined ?? '');
    if (!DATE.test(joined) || joined.slice(5, 7) !== m) continue;
    const years = y - Number(joined.slice(0, 4));
    const grant = table.get(years);
    if (!grant) continue;
    const day = `${month}-${joined.slice(8, 10)}`;
    let skip = '';
    if (s.left && s.left <= day) skip = `퇴사(${s.left})`;
    else if (!s.email) skip = '메일 주소 없음';
    out.push({ name: s.name, email: s.email || '', joined, years, amount: Number(grant.amount) || 0, leave: Number(grant.leave) || 0, day, skip });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.name.localeCompare(b.name, 'ko')));
}

export function longServiceValues(person, month, settings) {
  return {
    ...companyValues(settings),
    이름: person.name, 년수: String(person.years), 입사일: person.joined, 기념일: 날짜글(person.day),
    지원금: comma(person.amount), 재충전휴가: String(person.leave), 기준월: monthLabel(month),
  };
}

// ---------- 신규 입사자 ----------
export function hireValues(hire, settings, { mention = '' } = {}) {
  const h = hire ?? {};
  return {
    ...companyValues(settings),
    이름: h.name || '', 성별: h.gender || '', 입사일: h.start_date || '',
    부서: h.dept || '', 팀: h.team || '', 파트: h.part || '', 직군: h.job_group || '', 직무: h.job || '',
    고용형태: h.employ_type || '', 연락처: h.phone || '', 개인이메일: h.email || '',
    지원경로: h.route || '', 추천인: h.referrer || '', 영문이름: h.eng_name || '', 경력: h.career || '', 사번: h.emp_no || '',
    멘션: mention || '',
  };
}

// 단계 이름표.
export const HIRE_STAGES = [
  { key: 'register', title: '입사 확정', empty: '입사 확정된 사람이 없습니다.' },
  { key: 'enroll', title: '명부 등재', empty: '사번을 받아 명부에 올릴 사람이 없습니다.' },
  { key: 'done', title: '끝남', empty: '아직 끝난 사람이 없습니다.' },
];

export const HIRE_SORTS = {
  start_desc: '입사일 최근 순',
  start_asc: '입사일 빠른 순',
  name: '이름순',
  created_desc: '등록 최근 순',
};

const byName = new Intl.Collator('ko').compare;
function byStart(dir) {
  return (a, b) => {
    const x = String(a.data.start_date ?? '');
    const y = String(b.data.start_date ?? '');
    if (!x || !y) return (!x) - (!y) || byName(a.data.name, b.data.name);
    return (x < y ? -dir : x > y ? dir : 0) || byName(a.data.name, b.data.name);
  };
}
const COMPARE = {
  start_desc: byStart(-1),
  start_asc: byStart(1),
  name: (a, b) => byName(a.data.name, b.data.name) || byStart(-1)(a, b),
  created_desc: (a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
};
export function sortHires(rows, sort) {
  return [...(rows ?? [])].sort(COMPARE[sort] ?? COMPARE.start_desc);
}

// ---------- 보내기 ----------
// 메일 앱을 여는 주소. 본문이 길면 일부 메일 앱이 자르므로 2,000자 안팎까지만 넣고 나머지는 복사로 안내한다.
export function mailtoUrl(to, subject, body) {
  const q = new URLSearchParams();
  if (subject) q.set('subject', subject);
  if (body) q.set('body', body);
  return `mailto:${String(to ?? '').trim()}?${q.toString().replace(/\+/g, '%20')}`;
}

// 슬랙 Incoming Webhook 으로 글을 올린다. 브라우저에서 바로 보내면 응답은 읽지 못하지만(no-cors) 보내는 것은 된다.
export async function postSlack(webhook, text) {
  if (!/^https:\/\/hooks\.slack\.com\//.test(String(webhook ?? ''))) throw new Error('슬랙 Webhook 주소가 올바르지 않습니다(https://hooks.slack.com/… 이어야 합니다).');
  await fetch(webhook, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ text }) });
  return true;
}

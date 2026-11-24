// 자료 창구. 두 가지 저장소가 같은 함수 이름을 가진다.
//  - RemoteStore: Cloudflare Pages 에 올렸을 때. functions/api/* 가 D1 에 저장한다(모두가 같은 달력을 본다).
//  - LocalStore : 그냥 정적 파일로 열었을 때. 이 브라우저의 localStorage 에만 저장한다(혼자 써 보기용).
//  - SupabaseStore (supabase-store.js): config.js 에 Supabase 주소·키가 있을 때. 누구나 보고, 로그인한 관리자만 고친다.
// 시작할 때 Supabase 설정 → /api/me 응답 → Local 순으로 고른다.
import { expandMonth, holidaysOf, ymd, addDays } from './repeat.js';
import { HOLIDAYS, COVERED_YEARS } from './holidays.js';
import { DEFAULT_CATEGORIES, cleanItem, cleanCategories, cleanRecord, mergeSettings } from './model.js';
import { SUPABASE } from './config.js';
import { 대상월기본, 지난달, 월끝, 월글, 근속금액 } from './welfarecalc.js';
import { 잔여연차, 소속글, 문안종류 } from './offboardcalc.js';

const KEY = 'hr-calendar-v1';
const uid = () => 'cal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const rid = () => 'rec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const SETTINGS_ID = 'rec_settings';

// 처음 열었을 때 보이는 보기 일정. 지우거나 고쳐도 된다.
function seedItems() {
  const today = new Date();
  const year = today.getFullYear();
  const keys = DEFAULT_CATEGORIES.map((c) => c.key);
  const raw = [
    { title: '정기급여 기반자료 제작', category: 'payroll', repeat_kind: 'monthly', on_day: 16, holiday_rule: 'before', lead: '김담당', deputy: '이담당' },
    { title: '정기급여 공지 및 급여명세서 발송', category: 'payroll', repeat_kind: 'monthly', on_day: 23, holiday_rule: 'before', lead: '김담당' },
    { title: '정기급여 품의 및 이체등록', category: 'payroll', repeat_kind: 'monthly', on_day: 27, holiday_rule: 'before', lead: '김담당', deputy: '이담당' },
    { title: '원천세 신고자료 공유', category: 'tax', repeat_kind: 'monthly', on_day: 5, holiday_rule: 'after', lead: '이담당' },
    { title: '4대보험 정산자료 제작', category: 'insurance', repeat_kind: 'monthly', on_day: 6, lead: '이담당' },
    { title: '복지카드 청구내역 공유', category: 'welfare', repeat_kind: 'monthly', on_day: 6, lead: '김담당' },
    { title: '복지카드 한도부여', category: 'welfare', repeat_kind: 'month_end', holiday_rule: 'before', lead: '김담당' },
    { title: '용역 세금계산서 정산', category: 'settle', repeat_kind: 'monthly', on_day: 16, lead: '박담당' },
    { title: '주간 인사 회의', category: 'etc', repeat_kind: 'weekly', on_weekday: 1, lead: '팀 전체' },
    { title: '신규 입사자 온보딩 점검', category: 'onboard', repeat_kind: 'none', start_date: ymd(addDays(today, 3)), lead: '김담당', note: '장비·계정·교육 일정 확인' },
    { title: '분기 법정의무교육 안내', category: 'training', repeat_kind: 'quarterly', on_day: 10, start_date: year + '-01-10', lead: '박담당' },
    { title: '연간 평가 일정 안내', category: 'eval', repeat_kind: 'yearly', on_month: 12, on_day: 1, lead: '김담당' },
  ];
  return raw.map((x) => ({ id: uid(), ...cleanItem(x, keys) }));
}

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.items) && Array.isArray(saved.categories)) {
      if (!Array.isArray(saved.records)) saved.records = seedRecords();
      else {
        const fresh = seedRecords();
        const has = (kind) => saved.records.some((r) => r.kind === kind);
        // 예전에 열어 본 브라우저에는 조직도·TO·평가 보기 자료가 없다 — 그것만 채워 넣는다.
        if (!has('org')) saved.records.push(...fresh.filter((r) => ['org', 'to', 'eval'].includes(r.kind)));
        // 복지카드·예약 보기 자료(2026-11-18)와 그때 늘린 직원명부 사람들도 없으면 채운다(이미 있는 사번은 건드리지 않는다).
        if (!has('welfare')) {
          const ids = new Set(saved.records.map((r) => r.id));
          const empNos = new Set(saved.records.filter((r) => r.kind === 'staff').map((r) => r.data.emp_no));
          saved.records.push(...fresh.filter((r) => ['welfare', 'book'].includes(r.kind) && !ids.has(r.id)));
          saved.records.push(...fresh.filter((r) => r.kind === 'staff' && !ids.has(r.id) && !empNos.has(r.data.emp_no)));
          const probation = fresh.find((r) => r.id === 'rec_evals')?.data.lists.find((l) => l.id === 'el_probation');
          const mine = saved.records.find((r) => r.id === 'rec_evals')?.data.lists?.find((l) => l.id === 'el_probation');
          if (probation && mine && !mine.people.some((p) => p.id === 'ev_p4')) mine.people.push(probation.people.find((p) => p.id === 'ev_p4'));
        }
        // 퇴직자 보기 자료(2026-11-23)와 잔여연차를 셀 사용 연차. 한 번만 넣는다(지운 뒤 다시 생기지 않게 표시해 둔다).
        if (!saved.seeded_offboard) {
          saved.seeded_offboard = true;
          const ids = new Set(saved.records.map((r) => r.id));
          const 명부 = new Map(saved.records.filter((r) => r.kind === 'staff').map((r) => [r.data.emp_no, r]));
          for (const f of fresh.filter((r) => r.kind === 'staff')) {
            const mine = 명부.get(f.data.emp_no);
            if (!mine) continue;
            for (const k of ['leave_used', 'leave_settled', 'leave_extra']) if (f.data[k] !== undefined && mine.data[k] === undefined) mine.data[k] = f.data[k];
          }
          if (!has('offboard') && 명부.has('E1006')) saved.records.push(...fresh.filter((r) => r.kind === 'offboard' && !ids.has(r.id)));
        }
      }
      return saved;
    }
  } catch { /* 깨진 저장은 버린다 */ }
  return { items: seedItems(), done: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), records: seedRecords(), seeded_offboard: true };
}

// 체험 모드의 보기 직원명부(가공 데이터). 장기근속 메일·재직증명서가 찾을 사람이 있어야 눌러 볼 수 있다.
function seedRecords() {
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, '0');
  const now = new Date().toISOString();
  const today = new Date();
  const soon = (n) => ymd(addDays(today, n));
  const ago = (n) => new Date(today.getTime() - n * 86400000).toISOString();
  const agoDay = (n) => ago(n).slice(0, 10);
  // 복지카드 보기 자료가 여러 경우(3년 지남·휴직·퇴사 예정·수습 통과·전적·항상 제외)를 보여 주도록 열한 명을 둔다.
  // leave_used(사용 연차)·leave_settled(연차 정산)·leave_extra(대체휴가)는 퇴직자 등록이 잔여연차를 셀 때 쓴다 — 홍길동은 일부러 비워 '직접 적기' 를 보여 준다.
  const staff = [
    { name: '홍길동', emp_no: 'E1001', dept: '경영지원실', team: '인사팀', part: '', job_group: '경영/사업', job: '인사 담당', title: '팀장', joined: `${y - 6}-${m}-10`, left: '', email: 'gildong@example.com', employ_type: '정규' },
    { name: '김보람', emp_no: 'E1002', dept: '개발실', team: '서버팀', part: '', job_group: '프로그램', job: '서버 개발', title: '파트장', joined: `${y - 3}-${m}-02`, left: '', email: 'boram@example.com', employ_type: '정규', leave_used: 44 },
    { name: '이서준', emp_no: 'E1003', dept: '디자인실', team: 'UX팀', part: '', job_group: '아트', job: 'UI 디자인', title: '파트장', joined: `${y - 1}-03-15`, left: '', email: 'seojun@example.com', employ_type: '정규', leave_used: 18 },
    { name: '박지우', emp_no: 'E0907', dept: '사업실', team: '마케팅팀', part: '', job_group: '마케팅', job: '퍼포먼스 마케팅', title: '', joined: `${y - 4}-05-20`, left: `${y - 1}-08-31`, email: '', employ_type: '정규' },
    { name: '최다은', emp_no: 'E1004', dept: '경영지원실', team: '인사팀', part: '', job_group: '스탭', job: '인사 운영', title: '파트장', joined: `${y - 2}-07-01`, left: '', email: 'daeun@example.com', employ_type: '정규', leave_used: 30 },
    { name: '한지민', emp_no: 'E1005', dept: '경영지원실', team: '총무팀', part: '', job_group: '스탭', job: '총무', title: '파트장', joined: `${y - 4}-03-02`, left: '', leave_from: agoDay(45), leave_to: soon(40), email: 'jimin@example.com', employ_type: '정규' },
    { name: '송민재', emp_no: 'E1006', dept: '개발실', team: '서버팀', part: '', job_group: '프로그램', job: '서버 개발', title: '', joined: `${y - 2}-09-01`, left: soon(20), email: 'minjae@example.com', employ_type: '정규', leave_used: 25 },
    { name: '신동엽', emp_no: 'E1007', dept: '개발실', team: '클라이언트팀', part: '', job_group: '프로그램', job: '클라이언트 개발', title: '', joined: agoDay(75), left: '', email: 'dongyeop@example.com', employ_type: '정규', leave_used: 1 },
    { name: '류하린', emp_no: 'E1008', dept: '디자인실', team: '아트팀', part: '', job_group: '아트', job: '배경 아트', title: '', joined: agoDay(100), left: '', email: 'harin@example.com', employ_type: '정규', leave_used: 0 },
    { name: '백서윤', emp_no: 'E1009', dept: '개발실', team: 'QA팀', part: '', job_group: 'QA', job: 'QA', title: '', joined: agoDay(20), left: '', email: 'seoyun@example.com', employ_type: '계약', contract_end: soon(345) },
    { name: '윤서아', emp_no: 'E1010', dept: '경영진', team: '', part: '', job_group: '경영/사업', job: 'CFO', title: 'CFO', joined: `${y - 5}-01-02`, left: '', email: 'seoa@example.com', employ_type: '정규' },
    { name: '김태오', emp_no: 'E1011', dept: '경영지원실', team: '재무팀', part: '', job_group: '경영/사업', job: '회계', title: '', joined: `${y - 1}-02-01`, group_joined: `${y - 4}-02-01`, left: '', email: 'taeo@example.com', employ_type: '정규', leave_used: 50, leave_settled: `${y - 5}:4, ${y - 2}:3`, leave_extra: 1 },
  ];
  const rows = staff.map((s, i) => ({ id: 'rec_seed' + i, kind: 'staff', data: s, created_at: now, updated_at: now }));

  // 신규 입사자: 단계마다 한 명씩. 이름·연락처는 모두 지어낸 값이다.
  const ok = (days, extra = {}) => ({ status: 'ok', at: ago(days), by: '김담당', ...extra });
  const hires = [
    {
      name: '정하늘', gender: '여자', start_date: soon(12), dept: '개발실', team: '클라이언트팀', part: '', job_group: '프로그램', job: '클라이언트 개발자',
      employ_type: '정규', phone: '010-1234-5678', email: 'haneul@example.com', route: '직접지원', referrer: '', eng_name: 'haneul.jung', career: '4년2개월',
      stage: 'register', results: {}, log: [{ at: ago(1), by: '김담당', text: '입사자 등록' }],
    },
    {
      name: '오민준', gender: '남자', start_date: soon(5), dept: '사업실', team: '마케팅팀', part: '', job_group: '마케팅', job: '콘텐츠 마케터',
      employ_type: '정규', phone: '010-2345-6789', email: 'minjun@example.com', route: '사내인재추천', referrer: '김보람', eng_name: 'minjun.oh', career: '2년0개월',
      stage: 'enroll', notice_dest: '#사업실', notice_mentions: '@마케팅팀장',
      results: { calendar: ok(6), 'slack:dept': ok(6, { where: '#사업실', mention: '@마케팅팀장', copied: true }), 'slack:hr': ok(6, { where: '#인사팀', copied: true }), mail: ok(6, { to: 'minjun@example.com' }) },
      log: [
        { at: ago(6), by: '김담당', text: '단계 넘김: 명부 등재(일정을 만들어 자동으로)' },
        { at: ago(6), by: '김담당', text: '안내 메일 앱 엶 (minjun@example.com)' },
        { at: ago(6), by: '김담당', text: '인사팀 공지 문구 복사함 (#인사팀 에 붙여 넣기)' },
        { at: ago(6), by: '김담당', text: '부서 공지 문구 복사함 (#사업실 에 붙여 넣기)' },
        { at: ago(6), by: '김담당', text: `입사일 일정 만듦 (${soon(5)})` },
        { at: ago(7), by: '김담당', text: '입사자 등록' },
      ],
    },
    {
      name: '이서준', gender: '남자', start_date: `${y - 1}-03-15`, dept: '디자인실', team: 'UX팀', part: '', job_group: '아트', job: 'UI 디자인',
      employ_type: '정규', phone: '010-3456-7890', email: 'seojun.p@example.com', route: '서치펌추천', referrer: '', eng_name: 'seojun.lee', career: '6년1개월', emp_no: 'E1003', work_email: 'seojun@example.com',
      stage: 'done',
      results: { calendar: ok(40), 'slack:dept': ok(40, { where: '#디자인실', copied: true }), 'slack:hr': ok(40, { where: '#인사팀', copied: true }), mail: ok(40, { to: 'seojun.p@example.com' }), staff: ok(30, { ref: 'rec_seed2' }) },
      log: [
        { at: ago(30), by: '김담당', text: '단계 넘김: 끝남(명부 등재를 마쳐 자동으로)' },
        { at: ago(30), by: '김담당', text: '직원명부에 올림 (사번 E1003)' },
        { at: ago(40), by: '김담당', text: '단계 넘김: 명부 등재(일정을 만들어 자동으로)' },
        { at: ago(41), by: '김담당', text: '입사자 등록' },
      ],
    },
  ];
  hires.forEach((h, i) => rows.push({ id: 'rec_seedhire' + i, kind: 'hire', data: h, created_at: ago(41 - i * 10), updated_at: ago(1) }));

  // 자동화 실행 내역 몇 줄. 카드의 '마지막 실행' 과 [내역] 에 보인다.
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lm = lastMonth.getFullYear() + '-' + String(lastMonth.getMonth() + 1).padStart(2, '0');
  const lmLabel = `${lastMonth.getFullYear()}년 ${lastMonth.getMonth() + 1}월`;
  const runs = [
    { auto: 'payroll-notice', at: ago(16), by: '김담당', ok: true, summary: `본사 · ${lmLabel} 귀속 · 25일 지급`, detail: '#전사공지 에 올릴 문구를 복사했습니다. 슬랙에 붙여 넣어 주세요.', targets: [{ name: '#전사공지', ok: true }] },
    { auto: 'longservice-mail', at: ago(10), by: '김담당', ok: true, summary: `${lmLabel} 대상자 1명`, detail: '박지우에게 보낼 메일을 만들었습니다. 메일 앱에서 보내 주세요.', targets: [{ name: '박지우', to: 'jiwoo@example.com', ok: true }], month: lm },
  ];
  runs.forEach((r, i) => rows.push({ id: 'rec_seedrun' + i, kind: 'run', data: r, created_at: r.at, updated_at: r.at }));
  rows.push(...seedOrg({ y, soon, ago, now }));
  rows.push(...seedWelfare({ staff, today, ago, now }));
  rows.push(...seedBooks({ soon, ago, lmLabel }));
  rows.push(...seedOffboard({ staff, ago, agoDay }));
  return rows;
}

// 퇴직자 한 명: 이미 등록해 조직도 첫 정리(퇴직예정자 칸으로 옮기기)까지 끝났고, 실퇴직일의 둘째 정리를 기다리는 사람.
// 조직도·TO표 보기 자료의 송민재(퇴직예정자 칸, 서버 파트 결원 TO)와 짝이다.
function seedOffboard({ staff, ago, agoDay }) {
  const at = staff.findIndex((x) => x.emp_no === 'E1006');
  const s = staff[at];
  const 퇴직 = s.left;
  const 마지막 = agoDay(3);
  const 잔여 = 잔여연차(s, 퇴직, {});
  const kind = 문안종류(s.joined, 퇴직);
  const ok = (days, 말, extra = {}) => ({ status: 'ok', at: ago(days), by: '김담당', 말, ...extra });
  const data = {
    name: s.name, emp_no: s.emp_no, staff_id: 'rec_seed' + at, dept: 소속글(s), title: s.title, job_group: s.job_group, job: s.job,
    email: s.email, join_date: s.joined, group_join_date: '', last_day: 마지막, leave_day: 퇴직, reason: '자발적인 퇴사', adjust: 0, used_direct: null,
    notice_kind: kind, leave_days: 잔여?.잔여 ?? null, basis: 잔여, org_row_id: '',
    results: {
      'roster-date': ok(6, `직원명부 퇴사일 칸에 ${퇴직} 을(를) 적었습니다.`, { 값: 퇴직, 이전: '' }),
      channel: ok(6, '문구를 복사했습니다. 슬랙 #팀-피플 에 붙여 넣어 주세요.', { where: '#팀-피플', copied: true }),
      dm: ok(6, '문안을 복사했습니다. 슬랙에서 송민재 님에게 DM 으로 붙여 넣어 주세요.', { kind, copied: true }),
    },
    slots: {
      'org-first': { status: 'done', 때: `${마지막} 17:00`, note: '상자를 퇴직예정자 칸으로 옮겼습니다, 결원 TO 1개를 만들었습니다.', done_at: ago(3) },
      'org-second': { status: 'waiting', 때: `${퇴직} 17:00` },
    },
    log: [
      { at: ago(3), by: '김담당', target: 'org-first', text: '조직도 1 · 상자를 퇴직예정자 칸으로 옮겼습니다, 결원 TO 1개를 만들었습니다.' },
      { at: ago(6), by: '김담당', target: 'dm', text: 'DM · 문안을 복사했습니다.' },
      { at: ago(6), by: '김담당', target: 'channel', text: '채널 · 문구를 복사했습니다.' },
      { at: ago(6), by: '김담당', target: 'roster-date', text: `퇴사일 · 직원명부 퇴사일 칸에 ${퇴직} 을(를) 적었습니다.` },
      { at: ago(6), by: '김담당', target: 'register', text: '퇴직자 등록' },
    ],
  };
  return [{ id: 'rec_seedoff0', kind: 'offboard', data, created_at: ago(6), updated_at: ago(3) }];
}

// 복지카드: 지난달 확정 명단과 항상 제외 목록. 대상월(20일 이후면 다음 달)의 '지난달' 에 맞춰 넣는다.
function seedWelfare({ staff, today, ago, now }) {
  const 오늘 = ymd(today);
  const ym = 지난달(대상월기본(오늘));
  const 끝 = 월끝(ym);
  const 명단 = staff
    .filter((s) => !['E0907', 'E1007', 'E1008', 'E1009', 'E1010', 'E1011'].includes(s.emp_no)) // 퇴사자·수습 중·새 입사·임원(항상 제외)·전적자는 지난달 명단에 없다
    .filter((s) => !s.left || s.left >= `${ym}-01`)
    .map((s) => ({ 사번: s.emp_no, 이름: s.name, 금액: 근속금액(s.group_joined || s.joined, ym), 이슈: s.left && s.left <= 끝 ? `${Number(s.left.slice(5, 7))}/${Number(s.left.slice(8, 10))} 퇴사` : '' }));
  const data = {
    months: { [ym]: 명단 },
    exclude: [{ emp_no: 'E1010', reason: '임원 — 별도 복지 적용', added_at: ago(200), by: '김담당' }],
    log: [{ at: ago(25), by: '김담당', text: `${월글(ym)} 지급내역·한도설정 만듦 — ${명단.length}명` }],
  };
  return [{ id: 'rec_welfare', kind: 'welfare', data, created_at: ago(200), updated_at: now }];
}

// 자동화 예약 둘: 기다리는 것 하나, 때를 놓친 것 하나(홈의 [확인 필요] 에 보인다).
function seedBooks({ soon, ago, lmLabel }) {
  const 기다림 = {
    auto: 'payroll-notice', run_at: new Date(`${soon(4)}T10:00:00+09:00`).toISOString(), summary: `본사 · ${lmLabel} 귀속 · ${Number(soon(4).slice(8, 10))}일 지급`,
    where: '#전사공지', text: '(예약된 급여 공지 문구)', state: 'waiting', input: {}, created_at: ago(1), by: '김담당',
  };
  const 놓침 = {
    auto: 'payroll-notice', run_at: ago(2), summary: '본사 · 상여 지급 안내', where: '#전사공지', text: '(예약된 상여 공지 문구)', state: 'failed',
    detail: '정해진 때에 브라우저가 열려 있지 않았습니다. 지금 직접 실행해 주세요.', done_at: ago(1), input: {}, created_at: ago(5), by: '김담당',
  };
  return [
    { id: 'rec_seedbook0', kind: 'book', data: 기다림, created_at: ago(1), updated_at: ago(1) },
    { id: 'rec_seedbook1', kind: 'book', data: 놓침, created_at: ago(5), updated_at: ago(1) },
  ];
}

// 조직도·TO표·평가 현황의 보기 자료. 조직 이름도 사람 이름도 모두 지어낸 것이다(45명).
function seedOrg({ y, soon, ago, now }) {
  let n = 0;
  const rows = [];
  const U = (id, parent, name, role = '', extra = {}) => { rows.push({ id, parent_id: parent, kind: 'unit', name, role, job: '', title: '', dual: 0, tag: '', position: n++, note: '', ...extra }); return id; };
  const P = (parent, name, job, title = '파트원', extra = {}) => { rows.push({ id: 'p_' + (n + 100), parent_id: parent, kind: 'person', name, role: '', job, title, dual: 0, tag: '', position: n++, note: '', ...extra }); };

  // 경영지원본부
  const mgmt = U('u_mgmt', '', '경영지원본부', '본부장 / 윤서아');
  const hrTeam = U('u_hr_team', mgmt, '인사총무팀', '팀장 / 홍길동');
  const hr = U('u_hr', hrTeam, '인사 파트'); P(hr, '최다은', '스탭', '파트장'); P(hr, '정우진', '스탭');
  const ga = U('u_ga', hrTeam, '총무 파트'); P(ga, '한지민', '스탭', '파트장');
  const finTeam = U('u_fin_team', mgmt, '재무팀', '팀장 / 강민재');
  const fin = U('u_fin', finTeam, '재무회계 파트'); P(fin, '송예은', '경영/사업', '파트장'); P(fin, '김태오', '경영/사업');
  const mkt = U('u_mkt', mgmt, '마케팅 파트'); P(mkt, '전하율', '마케팅', '파트장'); P(mkt, '변서준', '마케팅'); P(mkt, '노은서', '아트', '파트원', { dual: 1 });

  // 모바일 스튜디오
  const mobile = U('u_mobile', '', '모바일 스튜디오', 'PD / 강현우');
  const devTeam = U('u_dev_team', mobile, '개발팀', '리더 / 서지호');
  const server = U('u_server', devTeam, '서버 파트'); P(server, '김보람', '프로그램', '파트장'); P(server, '이도현', '프로그램'); P(server, '임채윤', '프로그램');
  const client = U('u_client', devTeam, '클라이언트 파트'); P(client, '임수빈', '프로그램', '파트장'); P(client, '배준호', '프로그램'); P(client, '조예린', '프로그램'); P(client, '신동엽', '프로그램');
  const designTeam = U('u_design_team', mobile, '디자인팀', '리더 / 오세훈');
  const ui = U('u_ui', designTeam, 'UI 파트'); P(ui, '이서준', '아트', '파트장'); P(ui, '황지우', '아트'); P(ui, '문채원', '아트');
  const art = U('u_art', designTeam, '아트 파트'); P(art, '고은채', '아트', '파트장'); P(art, '노은서', '아트'); P(art, '류하린', '아트');
  const planTeam = U('u_plan_team', mobile, '기획팀', '리더 겸 / 강현우');
  const content = U('u_content', planTeam, '콘텐츠 파트'); P(content, '권태양', '기획', '파트장'); P(content, '남유나', '기획'); P(content, '안도윤', '기획');
  const qa = U('u_qa', planTeam, 'QA 파트'); P(qa, '장민호', 'QA', '파트장'); P(qa, '백서윤', 'QA');

  // 웹 스튜디오
  const web = U('u_web', '', '웹 스튜디오', 'PD / 유시우');
  const prodTeam = U('u_prod_team', web, '프로덕션팀', '리더 / 김하준');
  const pm = U('u_pm', prodTeam, 'PM 파트'); P(pm, '서윤호', 'PM', '파트장');
  const ops = U('u_ops', prodTeam, '운영 파트'); P(ops, '최현서', '운영/관리', '파트장'); P(ops, '정다인', '운영/관리'); P(ops, '김지호', 'QA');
  const webdevTeam = U('u_webdev_team', web, '웹개발팀', '리더 / 박서연');
  const front = U('u_front', webdevTeam, '프론트엔드 파트'); P(front, '조하람', '프로그램', '파트장'); P(front, '윤지후', '프로그램'); P(front, '홍세아', '프로그램');
  const back = U('u_back', webdevTeam, '백엔드 파트'); P(back, '양도윤', '프로그램', '파트장'); P(back, '손예진', '프로그램');
  const data = U('u_data', webdevTeam, '데이터 파트'); P(data, '구민서', '프로그램', '파트장'); P(data, '허윤아', '플랫폼');

  // 참고사항(인원수에서 빠진다): 경영진 · 출장/휴직/기타 · 퇴직예정자
  const exec = U('l_exec', '', '경영진', '', { tag: 'legend' }); P(exec, '김성민', '경영/사업', 'CEO', { tag: 'legend' }); P(exec, '박지훈', '프로그램', 'CTO', { tag: 'legend' }); P(exec, '윤서아', '경영/사업', 'CFO', { tag: 'legend' });
  const leave = U('l_leave', '', '출장/휴직/기타', '', { tag: 'legend' }); P(leave, '이가은', 'PM', '파트원', { tag: 'legend', note: '육아휴직 ~ ' + `${y + 1}-02-28` });
  const leaving = U('l_leaving', '', '퇴직예정자', '', { tag: 'legend' }); P(leaving, '송민재', '프로그램', '파트원', { tag: 'legend', note: '서버 파트 · ' + soon(20) + ' 퇴사' });

  const org = { rows, history: [{ at: ago(2), by: '김담당', people: 45, why: '저장' }] };

  // TO 자리. 상자 하나가 TO 하나다.
  const seat = (id, unit_id, extra) => ({ id, unit_id, reason: 'new', step: 'idle', left_name: '', left_at: '', job: '', hiring_at: '', hire_id: '', join_name: '', join_at: '', note: '', updated_at: ago(3), updated_by: '김담당', ...extra });
  const seats = [
    seat('seat_a1', 'u_server', { reason: 'left', left_name: '송민재', left_at: soon(20), note: '퇴직예정자 칸으로 옮기며 만들어짐' }),
    seat('seat_a2', 'u_client', { step: 'incoming', job: '클라이언트 개발자', hire_id: 'rec_seedhire0', hiring_at: ago(40) }),
    seat('seat_a3', 'u_qa', { step: 'hiring', job: 'QA 엔지니어', hiring_at: ago(15) }),
    seat('seat_a4', 'u_mkt', { reason: 'left', step: 'incoming', left_name: '박지우', left_at: `${y - 1}-08-31`, job: '콘텐츠 마케터', hire_id: 'rec_seedhire1' }),
    seat('seat_a5', 'u_fin', { step: 'hiring', job: '회계 담당', hiring_at: ago(30) }),
    seat('seat_a6', 'u_front', { job: '프론트엔드 개발자', note: '내년 상반기 증원' }),
    seat('seat_a7', 'u_data', { step: 'hiring', job: '데이터 엔지니어', hiring_at: ago(8) }),
    seat('seat_a8', 'u_hr', { note: '채용 담당 증원 검토' }),
  ];
  const log = [
    { at: ago(40), by: '김담당', unit_id: 'u_client', kind: 'seat-add', before: null, after: { reason: 'new', step: 'hiring' }, note: '클라이언트 개발자 공고' },
    { at: ago(30), by: '김담당', unit_id: 'u_fin', kind: 'seat-add', before: null, after: { reason: 'new', step: 'hiring' }, note: '회계 담당' },
    { at: ago(15), by: '김담당', unit_id: 'u_qa', kind: 'hiring', before: { reason: 'new', step: 'idle' }, after: { reason: 'new', step: 'hiring' }, note: 'QA 엔지니어' },
    { at: ago(12), by: '입사자', unit_id: 'u_client', kind: 'incoming', before: { reason: 'new', step: 'hiring' }, after: { reason: 'new', step: 'incoming' }, note: '정하늘 · ' + soon(12) },
    { at: ago(7), by: '입사자', unit_id: 'u_mkt', kind: 'incoming', before: { reason: 'left', step: 'idle' }, after: { reason: 'left', step: 'incoming' }, note: '오민준 · ' + soon(5) },
    { at: ago(3), by: '조직도', unit_id: 'u_server', kind: 'seat-add', before: null, after: { reason: 'left', step: 'idle' }, note: '송민재 퇴직예정' },
  ];
  const to = { seats, log };

  // 평가 현황. 평가 내용은 없고 누가·어느 단계·어떤 상태·마감만 있다.
  const st = (state, due = '', evaluator = '') => ({ state, due, evaluator });
  const D = st.bind(null, 'done');
  const T = () => st('todo');
  const mm = new Date().getMonth() + 1;
  const person = (id, name, org, sub, steps) => ({ id, name, org, sub, steps });
  const lists = [
    {
      id: 'el_probation', name: '수습평가', kind: 'probation', period: '', link: '', notif: { blocked: false, why: '' },
      stages: [['sp_goal', '목표 설정'], ['sp_confirm', '목표 확정'], ['sp_mid', '1차 평가 (1개월)'], ['sp_fb1', '1차 피드백 면담'], ['sp_final', '2차 평가 (2개월)'], ['sp_last', '최종 평가'], ['sp_fb2', '최종 피드백 면담']].map(([key, label]) => ({ key, label })),
      people: [
        person('ev_p1', '신동엽', '클라이언트 파트', `${ago(75).slice(5, 7).replace(/^0/, '')}/${ago(75).slice(8, 10).replace(/^0/, '')} 입사 · 프로그램`, [D('', '임수빈'), D('', '서지호'), D('', '임수빈'), D('', '임수빈'), D('', '임수빈'), st('now', soon(-4), '서지호'), st('todo', '', '임수빈')]),
        person('ev_p2', '황지우', 'UI 파트', `${ago(40).slice(5, 7).replace(/^0/, '')}/${ago(40).slice(8, 10).replace(/^0/, '')} 입사 · 아트`, [D('', '이서준'), D('', '오세훈'), st('now', soon(2), '이서준'), T(), T(), T(), T()]),
        person('ev_p3', '백서윤', 'QA 파트', `${ago(20).slice(5, 7).replace(/^0/, '')}/${ago(20).slice(8, 10).replace(/^0/, '')} 입사 · QA`, [D('', '장민호'), st('wait', '', '강현우'), T(), T(), T(), T(), T()]),
        // 수습을 모두 마친 사람 — 복지카드 화면이 '수습 통과' 로 찾아 이번 달 명단에 넣자고 한다.
        person('ev_p4', '류하린', '아트 파트', `${ago(100).slice(5, 7).replace(/^0/, '')}/${ago(100).slice(8, 10).replace(/^0/, '')} 입사 · 아트`, [D('', '고은채'), D('', '오세훈'), D('', '고은채'), D('', '고은채'), D('', '고은채'), D(ago(12).slice(0, 10), '오세훈'), D(ago(8).slice(0, 10), '고은채')]),
      ],
    },
    {
      id: 'el_monthly', name: 'Monthly 평가 (경영지원본부)', kind: 'cycle', period: `${mm}월`, link: '', notif: { blocked: false, why: '' },
      stages: [{ key: 'ms_self', label: '1단계' }, { key: 'ms_eval', label: '2단계' }],
      people: [
        person('ev_m1', '최다은', '인사 파트', '스탭', [D(), st('now', soon(1), '홍길동')]),
        person('ev_m2', '정우진', '인사 파트', '스탭', [D(), st('now', soon(1), '홍길동')]),
        person('ev_m3', '한지민', '총무 파트', '스탭', [D(), st('done', '', '홍길동')]),
        person('ev_m4', '송예은', '재무회계 파트', '경영/사업', [st('now', soon(-1)), st('todo', soon(1), '강민재')]),
      ],
    },
    {
      id: 'el_regular', name: `${y} 정기 인사평가`, kind: 'regular', period: '', link: '', notif: { blocked: false, why: '' },
      stages: [['self', '셀프평가'], ['r1', '1차 평가'], ['r2', '2차 평가'], ['calib', '캘리브레이션'], ['fb', '피드백 면담']].map(([key, label]) => ({ key, label })),
      people: [
        person('ev_r01', '이도현', '서버 파트', '프로그램', [D(), D('', '김보람'), st('now', soon(3), '서지호'), T(), T()]),
        person('ev_r02', '임채윤', '서버 파트', '프로그램', [D(), st('now', soon(-2), '김보람'), T(), T(), T()]),
        person('ev_r03', '배준호', '클라이언트 파트', '프로그램', [D(), D('', '임수빈'), D('', '서지호'), st('wait'), T()]),
        person('ev_r04', '조예린', '클라이언트 파트', '프로그램', [D(), D('', '임수빈'), D('', '서지호'), st('wait'), T()]),
        person('ev_r05', '문채원', 'UI 파트', '아트', [st('now', soon(-5)), T(), T(), T(), T()]),
        person('ev_r06', '류하린', '아트 파트', '아트', [D(), D('', '고은채'), st('now', soon(3), '오세훈'), T(), T()]),
        person('ev_r07', '남유나', '콘텐츠 파트', '기획', [D(), st('now', soon(-1), '권태양'), T(), T(), T()]),
        person('ev_r08', '안도윤', '콘텐츠 파트', '기획', [D(), D('', '권태양'), D('', '강현우'), D(), D('', '권태양')]),
        person('ev_r09', '정다인', '운영 파트', '운영/관리', [D(), D('', '최현서'), st('now', soon(6), '김하준'), T(), T()]),
        person('ev_r10', '김지호', '운영 파트', 'QA', [st('now', soon(1)), T(), T(), T(), T()]),
        person('ev_r11', '윤지후', '프론트엔드 파트', '프로그램', [D(), D('', '조하람'), D('', '박서연'), st('wait'), T()]),
        person('ev_r12', '홍세아', '프론트엔드 파트', '프로그램', [D(), st('now', soon(-3), '조하람'), T(), T(), T()]),
        person('ev_r13', '손예진', '백엔드 파트', '프로그램', [D(), D('', '양도윤'), st('now', soon(3), '박서연'), T(), T()]),
        person('ev_r14', '허윤아', '데이터 파트', '플랫폼', [D(), D('', '구민서'), D('', '박서연'), D(), st('now', soon(4), '구민서')]),
      ],
    },
    { id: 'el_convert', name: '정규직 전환평가', kind: 'other', period: '', link: '', notif: { blocked: true, why: '이 평가는 알림을 꺼 두었습니다' }, stages: [{ key: 'cv_1', label: '정규직 전환평가' }], people: [] },
  ];
  const evals = { lists };

  return [
    { id: 'rec_orgchart', kind: 'org', data: org, created_at: ago(60), updated_at: ago(2) },
    { id: 'rec_toseats', kind: 'to', data: to, created_at: ago(60), updated_at: ago(3) },
    { id: 'rec_evals', kind: 'eval', data: evals, created_at: ago(60), updated_at: now },
  ];
}

class LocalStore {
  constructor() {
    this.kind = 'local';
    this.state = loadLocal();
    this.save();
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* 사생활 보호 모드 등 */ }
  }
  keys() { return this.state.categories.map((c) => c.key); }

  async me() { return { email: '', name: '나' }; }

  async month(month) {
    const occ = expandMonth(this.state.items, month, HOLIDAYS);
    const doneSet = new Set(this.state.done);
    return {
      month,
      items: occ.map((o) => ({ ...o, done: doneSet.has(o.id + '|' + o.due), can_edit: true })),
      holidays: holidaysOf(HOLIDAYS, month),
      categories: this.state.categories,
      can_edit: true,
      can_edit_categories: true,
      covered: COVERED_YEARS.has(month.slice(0, 4)),
    };
  }
  async get(id) {
    const item = this.state.items.find((x) => x.id === id);
    if (!item) throw new Error('그 일정을 찾을 수 없습니다.');
    return { ...item };
  }
  async create(values) {
    const item = { id: uid(), ...cleanItem(values, this.keys()) };
    this.state.items.push(item);
    this.save();
    return item;
  }
  async update(id, values) {
    const at = this.state.items.findIndex((x) => x.id === id);
    if (at < 0) throw new Error('그 일정을 찾을 수 없습니다.');
    this.state.items[at] = { id, ...cleanItem(values, this.keys()) };
    this.save();
    return this.state.items[at];
  }
  async remove(id) {
    this.state.items = this.state.items.filter((x) => x.id !== id);
    this.state.done = this.state.done.filter((k) => !k.startsWith(id + '|'));
    this.save();
    return true;
  }
  async setDone(id, due, done) {
    const key = id + '|' + due;
    const has = this.state.done.includes(key);
    if (done && !has) this.state.done.push(key);
    if (!done && has) this.state.done = this.state.done.filter((k) => k !== key);
    this.save();
    return true;
  }
  async saveCategories(rows) {
    const inUse = [...new Set(this.state.items.map((x) => x.category))];
    this.state.categories = cleanCategories(rows, inUse);
    this.save();
    return this.state.categories;
  }

  // ---- 자동화 기록 ----
  async records(kind) {
    return this.state.records.filter((r) => r.kind === kind).map((r) => ({ ...r, data: { ...r.data } }));
  }
  async saveRecord(kind, id, data) {
    const clean = cleanRecord(kind, data);
    const now = new Date().toISOString();
    const at = id ? this.state.records.findIndex((r) => r.id === id) : -1;
    let row;
    if (at >= 0) {
      row = { ...this.state.records[at], kind, data: clean, updated_at: now };
      this.state.records[at] = row;
    } else {
      row = { id: id || rid(), kind, data: clean, created_at: now, updated_at: now };
      this.state.records.push(row);
    }
    this.save();
    return { ...row, data: { ...row.data } };
  }
  async deleteRecord(id) {
    this.state.records = this.state.records.filter((r) => r.id !== id);
    this.save();
    return true;
  }
  async settings() {
    const row = this.state.records.find((r) => r.id === SETTINGS_ID);
    return mergeSettings(row?.data);
  }
  async saveSettings(data) {
    await this.saveRecord('settings', SETTINGS_ID, data);
    return this.settings();
  }
}

class RemoteStore {
  constructor() { this.kind = 'remote'; }
  async request(path, init = {}) {
    const res = await fetch(path, {
      ...init,
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch { /* 본문 없음 */ }
    if (!res.ok) throw new Error(body?.error || `요청에 실패했습니다 (${res.status})`);
    return body;
  }
  me() { return this.request('/api/me'); }
  month(month) { return this.request('/api/calendar?month=' + encodeURIComponent(month)); }
  get(id) { return this.request('/api/items/' + encodeURIComponent(id)); }
  create(values) { return this.request('/api/items', { method: 'POST', body: JSON.stringify(values) }); }
  update(id, values) { return this.request('/api/items/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(values) }); }
  remove(id) { return this.request('/api/items/' + encodeURIComponent(id), { method: 'DELETE' }); }
  async setDone(id, due, done) { await this.request('/api/done', { method: 'POST', body: JSON.stringify({ id, due, done }) }); return true; }
  saveCategories(rows) { return this.request('/api/categories', { method: 'PUT', body: JSON.stringify(rows) }); }

  records(kind) { return this.request('/api/records?kind=' + encodeURIComponent(kind)); }
  saveRecord(kind, id, data) { return this.request('/api/records', { method: 'PUT', body: JSON.stringify({ kind, id: id || rid(), data: cleanRecord(kind, data) }) }); }
  async deleteRecord(id) { await this.request('/api/records?id=' + encodeURIComponent(id), { method: 'DELETE' }); return true; }
  async settings() {
    const rows = await this.records('settings');
    return mergeSettings(rows.find((r) => r.id === SETTINGS_ID)?.data);
  }
  async saveSettings(data) {
    await this.saveRecord('settings', SETTINGS_ID, data);
    return this.settings();
  }
}

export async function detectStore() {
  // 0) 주소에 ?mode=local 을 붙이면 설정과 상관없이 체험 모드로 연다(눌러 보기·시연용. 이 브라우저에만 저장된다).
  if (new URLSearchParams(location.search).get('mode') === 'local') return new LocalStore();
  // 1) Supabase 설정이 있으면 공유 모드. 연결이 안 되면(프로젝트가 잠들었거나 키가 틀리면) 체험 모드로 물러선다.
  if (SUPABASE.url && SUPABASE.anonKey) {
    try {
      const { SupabaseStore } = await import('./supabase-store.js');
      return await SupabaseStore.connect(SUPABASE);
    } catch (e) {
      console.warn('Supabase 연결 실패. 체험 모드로 엽니다.', e);
      const local = new LocalStore();
      local.fallback = e?.message || '서버에 연결하지 못했습니다';
      return local;
    }
  }
  // 2) Cloudflare Pages Functions 가 있으면 서버 모드.
  try {
    const res = await fetch('/api/me', { headers: { accept: 'application/json' } });
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) return new RemoteStore();
  } catch { /* 서버 없음 */ }
  return new LocalStore();
}

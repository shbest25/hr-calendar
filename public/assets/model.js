// 자료 모양과 검사 규칙. 브라우저와 서버(functions/)가 같은 파일을 쓴다 — 한 곳만 고치면 양쪽이 같이 바뀐다.

export const REPEAT_LABEL = {
  none: '한 번만',
  daily: '매일',
  workday: '평일마다',
  weekly: '매주',
  monthly: '매월',
  quarterly: '분기마다',
  yearly: '매년',
  month_end: '매월 말일',
};

export const HOLIDAY_LABEL = {
  keep: '그대로 둔다',
  before: '앞 평일로 당긴다',
  after: '뒤 평일로 미룬다',
};

export const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

export const ETC = 'etc';

// 처음 설치했을 때의 분야. 관리자가 '분야 고치기'에서 바꾼다.
export const DEFAULT_CATEGORIES = [
  { key: 'payroll', label: '급여', color: '#2E7D32' },
  { key: 'tax', label: '세무', color: '#6A1B9A' },
  { key: 'insurance', label: '인사행정', color: '#0277BD' },
  { key: 'settle', label: '용역관리', color: '#8D6E63' },
  { key: 'welfare', label: '복지', color: '#AD1457' },
  { key: 'onboard', label: '입·퇴사', color: '#4527A0' },
  { key: 'attend', label: '근태', color: '#558B2F' },
  { key: 'recruit', label: '채용', color: '#EF6C00' },
  { key: 'eval', label: '평가', color: '#C62828' },
  { key: 'training', label: '교육', color: '#00838F' },
  { key: 'etc', label: '기타', color: '#616161' },
];

// 새 분야에 돌아가며 주는 색. 허브 색(검정·초록)과 부딪히지 않는 짙은 색만.
export const PALETTE = ['#2E7D32', '#6A1B9A', '#0277BD', '#8D6E63', '#AD1457', '#4527A0',
  '#558B2F', '#EF6C00', '#C62828', '#00838F', '#37474F', '#5D4037'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const int = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
};

// 폼이나 API 로 들어온 일정을 믿지 않고 하나씩 거른다. 잘못되면 Error 를 던진다(메시지는 그대로 화면에 보인다).
export function cleanItem(raw, categoryKeys) {
  const v = raw || {};
  const item = {
    title: str(v.title, 100),
    category: categoryKeys.includes(v.category) ? v.category : ETC,
    repeat_kind: REPEAT_LABEL[v.repeat_kind] ? v.repeat_kind : 'none',
    on_weekday: int(v.on_weekday, 0, 6, 1),
    on_day: int(v.on_day, 1, 31, 1),
    on_month: int(v.on_month, 1, 12, 1),
    start_date: DATE.test(v.start_date || '') ? v.start_date : '',
    end_date: DATE.test(v.end_date || '') ? v.end_date : '',
    holiday_rule: HOLIDAY_LABEL[v.holiday_rule] ? v.holiday_rule : 'keep',
    lead: str(v.lead, 40),
    deputy: str(v.deputy, 40),
    note: str(v.note, 1000),
  };
  if (!item.title) throw new Error('이름을 적어 주세요.');
  if (item.repeat_kind === 'none' && !item.start_date) throw new Error('한 번만 하는 일정은 날짜(시작일)가 필요합니다.');
  if (item.start_date && item.end_date && item.end_date < item.start_date) throw new Error('종료일이 시작일보다 앞설 수 없습니다.');
  return item;
}

// 분야 목록 전체를 한 번에 받는다. 쓰는 중인 분야와 '기타'는 뺄 수 없다.
export function cleanCategories(raw, inUse = []) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('분야가 하나도 없습니다.');
  const seen = new Set();
  const rows = raw.map((r) => {
    const key = String(r?.key ?? '').trim();
    const label = str(r?.label, 12);
    const color = String(r?.color ?? '').trim().toUpperCase();
    if (!/^[a-z][a-z0-9_]{0,19}$/.test(key)) throw new Error('분야 열쇠가 올바르지 않습니다: ' + key);
    if (seen.has(key)) throw new Error('같은 분야가 두 번 있습니다: ' + key);
    if (!label) throw new Error('이름이 빈 분야가 있습니다.');
    if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error('색이 올바르지 않습니다: ' + label);
    seen.add(key);
    return { key, label, color };
  });
  if (!seen.has(ETC)) throw new Error("'기타' 분야는 뺄 수 없습니다.");
  for (const key of inUse) {
    if (!seen.has(key)) throw new Error(`'${key}' 분야를 쓰는 일정이 있어 뺄 수 없습니다.`);
  }
  return rows;
}

// 비어 있지 않은 열쇠 하나 만들기: cat1, cat2, ...
export function nextKey(used, at = 1) {
  const key = 'cat' + at;
  return used.has(key) ? nextKey(used, at + 1) : key;
}

// ---------- 자동화 기록(records) ----------
// 자동화 화면(신규 입사자·직원명부·증명서·실행 내역·설정)은 모두 '기록' 한 테이블에 JSON 으로 둔다.
// kind 로 종류를 가른다. 모양 검사는 가볍게만 한다(화면이 만든 값이고, 잘못돼도 달력은 멀쩡하다).
// org = 조직도(한 기록에 줄 전부), to = TO 자리와 기록, eval = 평가 현황.
export const RECORD_KINDS = ['hire', 'staff', 'cert', 'run', 'settings', 'org', 'to', 'eval'];

export function cleanRecord(kind, data) {
  if (!RECORD_KINDS.includes(kind)) throw new Error('모르는 기록 종류입니다: ' + kind);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('기록 내용이 올바르지 않습니다.');
  const text = JSON.stringify(data);
  if (text.length > 400000) throw new Error('기록이 너무 큽니다(400KB 까지).');
  return JSON.parse(text);
}

// 자동화 기본 설정. 화면의 [설정]에서 고치면 'settings' 기록으로 저장되고, 여기 값은 비어 있는 칸을 채우는 데만 쓰인다.
// 회사 이름·주소·문구는 모두 보기용이다 — 실제로 쓰기 전에 [설정]에서 우리 회사 것으로 바꾼다.
export const DEFAULT_SETTINGS = {
  company: {
    name: '㈜우리회사',           // 증명서에 찍히는 정식 회사명
    short: '우리회사',            // 문구 안에서 부르는 짧은 이름
    address: '서울특별시 ○○구 ○○로 00',
    hr_team: '인사팀',
    hr_mail: '',                  // 안내 메일의 회신 주소(비우면 메일 앱의 기본 계정)
    contact_phone: '010-0000-0000',
    slack_webhook: '',            // 슬랙 Incoming Webhook 주소. 비우면 문구를 복사해 직접 올린다.
  },
  payroll: {
    corps: [
      { key: 'main', label: '본사', channel: '#전사공지', ot_from: 21, ot_to: 20, ot_prev: true, text: '' },
    ],
    manager: '@인사담당자',
    text: [
      '*[{{귀속월}} 급여 지급 안내]*',
      '',
      '안녕하세요, {{인사팀}}입니다.',
      '',
      '{{짧은귀속월}} 급여({{귀속기간}})가 {{지급일}} 지급될 예정입니다.',
      '자세한 내용은 아래 참고사항을 확인해 주세요.',
      '',
      '*[참고사항]*',
      '• 급여는 순차 지급되어 개인별로 입금 시각에 차이가 있을 수 있습니다.',
      '• 이번 연장근무수당은 {{연장근무기간}} 기간에 대한 수당입니다.',
      '',
      '*[주의사항]*',
      '• 급여 아웃소싱 업체에서 발송되는 급여명세서 메일은 공식 안내입니다. 스팸 처리되지 않도록 발신처를 확인해 주세요.',
      '• 개인별 급여명세서는 오늘 중 사내 메일로 발송됩니다. 조회할 때 급여 정보가 타인에게 노출되지 않도록 유의해 주세요.',
      '',
      '궁금한 점은 {{담당자}} 에게 DM 부탁드립니다.',
      '감사합니다.',
    ].join('\n'),
  },
  longservice: {
    grants: [
      { years: 3, amount: 500000, leave: 5 },
      { years: 6, amount: 1000000, leave: 10 },
      { years: 9, amount: 1500000, leave: 15 },
    ],
    subject: '[{{회사}}] 재충전휴가 및 지원금 지급 안내',
    body: [
      '안녕하세요, {{이름}}님.',
      '',
      '{{회사}} 입사 후 지금까지 회사의 성장에 기여해 주셔서 감사드립니다.',
      '{{이름}}님은 {{기준월}} 장기근속(근속 {{년수}}년, {{기념일}}) 대상자에 해당되어 다음과 같이 안내드립니다.',
      '',
      '1. 재충전 휴가',
      '  1) 사용 가능한 재충전 휴가는 {{재충전휴가}}일입니다.',
      '  2) 재충전 휴가는 지급일로부터 1년 내 사용 가능하며 최소 1일부터 사용 가능합니다.',
      '',
      '2. 재충전휴가 지원금',
      '  1) 휴가지원금은 당월 말일 급여계좌로 지급됩니다.',
      '  - 지원 금액: {{지원금}}원',
      '',
      '재충전 휴가와 지원금이 그동안의 노고에 작은 보탬이 되기를 바랍니다.',
      '문의는 이 메일로 회신해 주세요.',
      '',
      '{{인사팀}} 드림',
    ].join('\n'),
  },
  hire: {
    depts: ['경영지원실', '개발실', '사업실', '디자인실'],
    jobs: ['기획', '프로그램', '아트', '경영/사업', '운영/관리', '마케팅', '기타'],
    employ_types: ['정규', '계약'],
    routes: ['직접지원', '사내인재추천', '서치펌추천', '기타'],
    hr_channel: '#인사팀',
    calendar_title: '[입사] {{부서}}-{{직군}} / {{이름}}',
    slack_notice: [
      '{{멘션}} 님, 신규 입사자 입사 일정이 확정되어 공유드립니다. 🙏',
      '',
      '[입사 확정 - {{이름}}님]',
      '소속 및 직무: {{부서}} {{팀}} {{파트}} / {{직무}}',
      '입사일 : {{입사일}}',
      '',
      '✅ 후보자와 입사일 조율 후 가장 빠른 일정으로 진행한 점 참고 부탁드립니다.',
    ].join('\n'),
    slack_hr_notice: [
      '입사 예정자가 발생하여 아래와 같이 안내드립니다.',
      '',
      '[입사 확정 - {{이름}} 님]',
      '부서    : {{부서}}',
      '팀      : {{팀}}',
      '파트    : {{파트}}',
      '직무    : {{직무}}',
      '고용형태: {{고용형태}}',
      '입사일  : {{입사일}}',
    ].join('\n'),
    mail_subject: '[{{회사}}] {{이름}}님 입사를 축하드립니다!',
    mail_text: [
      '{{이름}}님, 입사를 진심으로 축하드립니다.',
      '{{회사}}의 구성원이 되신 것을 환영하며, 함께 일할 수 있게 되어 기쁩니다.',
      '',
      '입사 전에 아래 네 가지를 준비해 주세요.',
      '',
      '1. 영문이름 확인 (확인 후 바로 회신)',
      '   - {{영문이름}} 이(가) 맞는지 확인해 회신해 주세요. 업무 메일 계정과 사원증 제작에 쓰입니다.',
      '',
      '2. 입사 서류 (입사 전주 목요일까지 회신)',
      '   1) 통장 사본',
      '   2) 주민등록등본 (주민번호 뒷자리 포함)',
      '   3) 고용보험 가입이력 (신입 제외)',
      '   4) 최종학교 졸업증명서',
      '   5) 가족관계증명서(상세) — 건강보험 피부양자 등록이 필요한 분만',
      '',
      '3. 웰컴 보드용 자료 (입사 전주 목요일까지 회신)',
      '   - 상반신 사진 1장, 나를 소개하는 키워드 3~4개',
      '',
      '4. 첫 출근',
      '   - 출근일: {{입사일}}',
      '   - 주소: {{주소}}',
      '   - 오전 10시까지 도착하신 뒤 담당자({{담당자연락처}})에게 연락 주세요.',
      '',
      '궁금한 점은 이 메일로 회신해 주세요.',
      '다시 한번 입사를 환영합니다.',
      '',
      '{{회사}} {{인사팀}} 드림',
    ].join('\n'),
  },
  cert: {
    manager: '',   // 면접확인서 담당자 이름(비우면 로그인한 사람)
    seal: '',      // 인감 그림(data: URL). [설정]에서 올린다.
  },
};

// 저장된 설정 위에 기본값을 덮어 빈 칸을 채운다(새 항목이 생겨도 옛 설정이 깨지지 않게).
export function mergeSettings(saved) {
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const mine = saved?.[key];
    out[key] = { ...def, ...(mine && typeof mine === 'object' ? mine : {}) };
  }
  return out;
}

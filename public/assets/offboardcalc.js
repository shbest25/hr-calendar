// 퇴직자 화면의 계산(2026-11-23) — DOM 을 모르는 순수 함수만 둔다.
// 잔여연차·마지막 근무일 참고·안내 문안 고르기·할 일 계획·목록의 점과 줄을 여기서 만든다.
// 서버가 없는 앱이라 사용 연차는 직원명부에 적어 둔 값(사용 연차)이나 등록할 때 직접 적은 값으로 센다.
import { HOLIDAYS, COVERED_YEARS } from './holidays.js';
import { fill, companyValues } from './autotext.js';
import { 리더정보 } from './orgchart.js';

const 글 = (v) => String(v ?? '').trim();
export const 날꼴 = /^\d{4}-\d{2}-\d{2}$/;
const 날 = (ymd) => new Date(`${ymd}T00:00:00Z`);
const 날글 = (d) => d.toISOString().slice(0, 10);
export const 날더하기 = (ymd, n) => { const d = 날(ymd); d.setUTCDate(d.getUTCDate() + n); return 날글(d); };
const 달더하기 = (ymd, n) => {
  const d = 날(ymd);
  const 일 = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(Math.min(일, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return 날글(d);
};
const 둥글 = (n) => Math.round(n * 100) / 100;

// 일수 글. 부호를 붙이면 +·− 를 앞에 둔다.
export function 숫자글(n, 부호 = false) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '모름';
  const 값 = 둥글(n);
  const 몸 = `${Math.abs(값)}일`;
  if (값 < 0) return `−${몸}`;
  return 부호 && 값 > 0 ? `+${몸}` : 몸;
}

// 온점·물음표 뒤에서 줄을 바꾼다(화면은 pre-line 으로 보인다).
export const 문장나누기 = (t) => String(t ?? '').replace(/([.?!])\s+(?=\S)/g, '$1\n');

// ── 사람 찾기 ──
// '이름 또는 사번' 칸 → 직원명부 재직자(퇴사일이 없거나 아직 안 지난 사람) 가운데 맞는 사람들.
export function 사람찾기(staffRows, text, 오늘) {
  const s = 글(text).normalize('NFC');
  if (!s) return [];
  const 큰 = s.replace(/\s+/g, '').toUpperCase();
  const 재직 = (staffRows ?? []).filter((r) => !글(r.data.left) || 글(r.data.left) >= 오늘);
  const 사번 = 재직.filter((r) => 글(r.data.emp_no).toUpperCase() === 큰);
  return 사번.length ? 사번 : 재직.filter((r) => 글(r.data.name) === s);
}

export const 소속글 = (s) => [s?.dept, s?.team, s?.part].map(글).filter(Boolean).join(' ');

// ── 잔여연차 ──
// 그룹입사일부터 실퇴직일까지 채운 달 수(실퇴직일까지 일한 것으로 본다).
export function 만근개월(입사, 퇴직) {
  if (!날꼴.test(글(입사)) || !날꼴.test(글(퇴직)) || 퇴직 < 입사) return 0;
  const a = 날(입사);
  const b = 날(날더하기(퇴직, 1));
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

// 첫해는 채운 달마다 1일(11일까지), 12개월을 채울 때마다 15일(2년마다 1일씩 늘어 25일까지).
export function 총발생(개월) {
  const 해마다 = [{ 해: 0, 일수: Math.min(Math.max(개월, 0), 11) }];
  for (let n = 1; n <= Math.floor(개월 / 12); n += 1) 해마다.push({ 해: n, 일수: Math.min(25, 15 + Math.floor((n - 1) / 2)) });
  return { 합: 해마다.reduce((a, x) => a + x.일수, 0), 해마다 };
}

// 직원명부의 '연차 정산' 칸 글('2024:3, 2025:1.5') → [{ year, days }]
export function 정산읽기(text) {
  return 글(text).split(/[,\n;]+/).map((조각) => {
    const m = /^\s*(\d{4})\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(조각);
    return m ? { year: Number(m[1]), days: Number(m[2]) } : null;
  }).filter(Boolean);
}

// 그 해 정산을 빼지 않는 까닭. 빼면 ''. 0 이하로 적힌 해와 그룹입사일의 해보다 앞선 해(앞선 재직 몫)는 빼지 않는다.
export function 정산안빼는까닭(줄, 그룹입사일 = '') {
  if (!(Number(줄?.days) > 0)) return '0보다작음';
  const 입사해 = Number(글(그룹입사일).slice(0, 4));
  if (입사해 > 0 && Number(줄?.year) < 입사해) return '입사앞해';
  return '';
}

const 수인가 = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

// staff: 직원명부 한 줄(data). 돌려줌: null(그룹입사일을 몰라 셀 수 없음) 또는 근거 묶음.
//   사용출처: '직접'(등록할 때 적음) · '명부'(직원명부의 사용 연차) · ''(모름 — 잔여도 null)
export function 잔여연차(staff, 실퇴직일, { 조정 = 0, 사용직접 = undefined } = {}) {
  const 그룹입사일 = 글(staff?.group_joined) || 글(staff?.joined);
  if (!날꼴.test(그룹입사일) || !날꼴.test(글(실퇴직일)) || 실퇴직일 < 그룹입사일) return null;
  const 개월 = 만근개월(그룹입사일, 실퇴직일);
  const 발생 = 총발생(개월);
  const 정산 = 정산읽기(staff?.leave_settled);
  const 정산차감 = 정산.reduce((a, x) => a + (정산안빼는까닭(x, 그룹입사일) ? 0 : x.days), 0);
  const 대체휴가 = 수인가(staff?.leave_extra) ? Number(staff.leave_extra) : 0;
  const 직접 = 수인가(사용직접);
  const 명부 = 수인가(staff?.leave_used);
  const 사용 = 직접 ? Number(사용직접) : 명부 ? Number(staff.leave_used) : null;
  const 조 = Number(조정) || 0;
  return {
    그룹입사일, 만근개월: 개월, 총발생: 발생.합, 해마다: 발생.해마다, 정산, 정산차감: 둥글(정산차감), 대체휴가,
    사용, 사용출처: 직접 ? '직접' : 명부 ? '명부' : '', 조정: 조,
    잔여: 사용 === null ? null : 둥글(발생.합 - 정산차감 + 대체휴가 - 사용 + 조),
  };
}

// 근거 표의 줄 [{ k, v }].
export function 근거줄(잔여) {
  if (!잔여) return [];
  return [
    { k: '총 발생', v: `${숫자글(잔여.총발생)} (만근 ${잔여.만근개월}개월)` },
    { k: '정산 차감', v: 잔여.정산차감 ? 숫자글(-잔여.정산차감) : '0일' },
    { k: '대체휴가', v: 숫자글(잔여.대체휴가, true) },
    { k: '사용', v: 잔여.사용 === null ? '모름' : `${숫자글(잔여.사용)}${잔여.사용출처 === '직접' ? ' (직접 적음)' : ''}` },
    { k: '조정', v: 숫자글(잔여.조정, true) },
    { k: '잔여', v: 숫자글(잔여.잔여) },
  ];
}

// 근거 줄 이름 → 펼치면 보일 것 { 글:[문장], 표?:{ 머리, 줄 } }. 그 숫자가 어디서 왔는지 보여 준다.
export function 근거펼침(잔여) {
  if (!잔여) return {};
  const 까닭들 = 잔여.정산.map((x) => 정산안빼는까닭(x, 잔여.그룹입사일));
  const 셈 = 잔여.잔여 === null ? '' : `${숫자글(잔여.총발생)} − ${숫자글(잔여.정산차감)} + ${숫자글(잔여.대체휴가)} − ${숫자글(잔여.사용)} ${잔여.조정 < 0 ? '−' : '+'} ${숫자글(Math.abs(잔여.조정))} = ${숫자글(잔여.잔여)}`;
  return {
    '총 발생': {
      글: [
        `그룹입사일(${잔여.그룹입사일})부터 실퇴직일까지 만근 ${잔여.만근개월}개월입니다.`,
        '첫해는 채운 달마다 1일씩, 11일까지 생깁니다.',
        '12개월을 채울 때마다 15일이 생기고, 2년마다 1일씩 늘어 25일까지 생깁니다.',
      ],
      표: { 머리: ['언제', '생긴 일수'], 줄: 잔여.해마다.map((x) => [x.해 === 0 ? '첫해' : `만근 ${x.해 * 12}개월`, 숫자글(x.일수)]) },
    },
    '정산 차감': {
      글: [
        잔여.정산.length ? "직원명부 '연차 정산' 칸에 적힌 해마다의 정산 일수입니다." : '이 사람의 연차 정산 기록이 없습니다.',
        ...(까닭들.includes('0보다작음') ? ['0보다 크지 않게 적힌 해는 빼지 않습니다.'] : []),
        ...(까닭들.includes('입사앞해') ? ['그룹입사일 앞의 해는 앞선 재직 몫이라 빼지 않습니다.'] : []),
      ],
      표: 잔여.정산.length ? { 머리: ['해', '정산 일수', '뺌'], 줄: 잔여.정산.map((x, i) => [`${x.year}년`, 숫자글(x.days), 까닭들[i] ? '빼지 않음' : '뺌']) } : null,
    },
    대체휴가: { 글: ["직원명부 '대체휴가' 칸의 일수입니다.", 잔여.대체휴가 ? '이 일수만큼 더합니다.' : '적힌 값이 없어 0일입니다.'] },
    사용: {
      글: 잔여.사용출처 === '직접' ? ['담당자가 등록할 때 직접 적은 값입니다.']
        : 잔여.사용출처 === '명부' ? ["직원명부 '사용 연차' 칸에 적힌 값입니다.", '그 뒤에 쓴 연차는 빠졌을 수 있습니다.']
          : ["직원명부에 '사용 연차' 가 적혀 있지 않습니다.", '사용 일수를 직접 적어 주세요.'],
    },
    조정: {
      글: [
        '기록으로 셀 수 없는 연차를 손으로 더하거나 뺍니다.',
        '포상 휴가처럼 회사가 따로 더 준 날은 더합니다.',
        '「조정(일)」 칸에 더할 날은 숫자만, 뺄 날은 앞에 - 를 붙여 적습니다.',
      ],
    },
    잔여: { 글: ['잔여 = 총 발생 − 정산 차감 + 대체휴가 − 사용 + 조정', ...(셈 ? [셈] : ['사용 연차를 몰라 잔여를 셀 수 없습니다.'])] },
  };
}

// 잔여를 모두 쓰면 마지막 근무일이 언제인가. 주말과 공휴일은 건너뛴다.
// 돌려줌: null 또는 { 날, 반차, 공휴일모름 }
export function 막근참고(잔여일, 실퇴직일) {
  if (typeof 잔여일 !== 'number' || !날꼴.test(글(실퇴직일))) return null;
  const 쉬는날들 = new Set(HOLIDAYS.map((h) => h.date));
  let 공휴일모름 = false;
  const 쉬나 = (ymd) => {
    if (!COVERED_YEARS.has(ymd.slice(0, 4))) 공휴일모름 = true;
    const 요일 = 날(ymd).getUTCDay();
    return 요일 === 0 || 요일 === 6 || 쉬는날들.has(ymd);
  };
  const 앞평일 = (ymd) => { let d = 날더하기(ymd, -1); while (쉬나(d)) d = 날더하기(d, -1); return d; };
  let d = 실퇴직일;
  while (쉬나(d)) d = 날더하기(d, -1);
  let 남음 = Math.max(0, 잔여일);
  while (남음 >= 1) { d = 앞평일(d); 남음 -= 1; }
  return { 날: d, 반차: 남음 >= 0.5, 공휴일모름 };
}

export function 막근글(참고) {
  if (!참고?.날) return '';
  const 줄 = `잔여를 모두 쓰면 마지막 근무일은 ${참고.날}${참고.반차 ? '(그날 반차)' : ''}입니다.`;
  return 참고.공휴일모름 ? `${줄}\n공휴일 목록이 없는 해를 지나 날짜가 다를 수 있습니다.` : 줄;
}

// ── 안내 DM 문안 ──
export const 문안이름 = { over1: '1년 이상 근무', under1: '1년 미만 근무', probation: '수습 중 퇴사' };

// 입사 3개월 안이면 수습 중, 1년 안이면 1년 미만, 그 밖은 1년 이상. 입사일을 모르면 ''.
export function 문안종류(입사일, 실퇴직일) {
  if (!날꼴.test(글(입사일)) || !날꼴.test(글(실퇴직일))) return '';
  if (실퇴직일 < 달더하기(입사일, 3)) return 'probation';
  return 실퇴직일 < 달더하기(입사일, 12) ? 'under1' : 'over1';
}

// 문구 틀에 넣을 값. rec: 퇴직자 기록.
export function 퇴직값들(rec, settings) {
  return {
    ...companyValues(settings),
    이름: 글(rec?.name), 소속: 글(rec?.dept), 마지막근무일: 글(rec?.last_day), 실퇴직일: 글(rec?.leave_day),
    퇴사사유: 글(rec?.reason), 잔여연차: typeof rec?.leave_days === 'number' ? String(둥글(rec.leave_days)) : '확인 중',
  };
}
export const 자리표시자 = ['이름', '소속', '마지막근무일', '실퇴직일', '퇴사사유', '잔여연차', '회사', '인사팀'];

// ── 모두싸인 번호표 ──
export const 기본번호 = { 소속부서: 1, 직책직군: 2, 사번: 3, 성명: 4, 입사일: 5, 동의서사번: 6, 동의서성명: 7 };
export const 번호표이름 = { 소속부서: '소속부서', 직책직군: '직책/직군', 사번: '사번', 성명: '성명', 입사일: '입사일', 동의서사번: '동의서 사번', 동의서성명: '동의서 성명' };

// 일곱 칸이 1~7 정수이고 서로 겹치지 않아야 한다. 돌려줌: '' 또는 오류 글.
export function 번호표문제(값 = {}) {
  const 쓴 = new Map();
  for (const key of Object.keys(기본번호)) {
    const n = Number(값?.[key]);
    if (!Number.isInteger(n) || n < 1 || n > 7) return `「${번호표이름[key]}」 칸 번호는 1~7 사이 정수여야 합니다.`;
    if (쓴.has(n)) return `「${번호표이름[key]}」·「${번호표이름[쓴.get(n)]}」 칸이 같은 번호(${n})입니다. 번호는 겹치면 안 됩니다.`;
    쓴.set(n, key);
  }
  return '';
}

// ── 조직도에서 그 사람 찾기 ──
// rows: 조직도 줄. 돌려줌: { 본:[사람 줄], 겸:[겸직 줄], 리더칸:[그 사람이 리더로 적힌 조직 칸], 예정:[퇴직예정자 칸의 줄], 예정칸 }
export function 조직자리(rows, name) {
  const 이름 = 글(name);
  const all = rows ?? [];
  const 사람 = all.filter((r) => r.kind === 'person' && 글(r.name) === 이름);
  const 예정칸 = all.find((r) => r.kind === 'unit' && r.tag === 'legend' && 글(r.name).includes('퇴직예정')) ?? null;
  return {
    본: 사람.filter((r) => r.tag !== 'legend' && !r.dual),
    겸: 사람.filter((r) => r.tag !== 'legend' && r.dual),
    리더칸: all.filter((r) => r.kind === 'unit' && r.tag !== 'legend' && 리더정보(r)?.이름 === 이름),
    예정: 사람.filter((r) => 예정칸 && String(r.parent_id) === String(예정칸.id)),
    예정칸,
  };
}

// 조직 칸의 경로 글('모바일 스튜디오 › 개발팀 › 서버 파트').
export function 칸경로(rows, id) {
  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));
  const out = [];
  for (let n = byId.get(String(id)); n; n = byId.get(String(n.parent_id ?? ''))) out.unshift(글(n.name));
  return out.join(' › ');
}

// ── 할 일 ──
export const 지금할일들 = ['roster-date', 'hub-cal', 'google-cal', 'channel', 'dm', 'modusign'];
export const 그날할일들 = ['org-first', 'org-second'];
export const 짧은이름 = {
  'roster-date': '퇴사일', 'hub-cal': '캘린더', 'google-cal': '구글 일정', channel: '채널', dm: 'DM', modusign: '모두싸인',
  'org-first': '조직도 1', 'org-second': '조직도 2',
};
export const 지금하기 = '지금 하기';
export const 이미함 = '이미 함';
export const 그날시각 = '17:00';

// 캘린더에 만들 일정. 두 날이 같으면 하나만.
export function 일정들(rec, settings) {
  const 제목 = fill(settings?.offboard?.calendar_title || '[퇴사] {{소속}} / {{이름}}', 퇴직값들(rec, settings));
  if (!날꼴.test(글(rec?.leave_day))) return [];
  if (!날꼴.test(글(rec?.last_day)) || rec.last_day === rec.leave_day) return [{ date: rec.leave_day, title: `${제목} — 마지막 근무일·퇴사일` }];
  return [{ date: rec.last_day, title: `${제목} — 마지막 근무일` }, { date: rec.leave_day, title: `${제목} — 퇴사일` }];
}

// 구글 캘린더 '일정 만들기' 주소(새 탭). 하루 종일 일정이라 끝 날짜는 다음 날이다.
export function 구글일정주소(rec, settings) {
  const 제목 = fill(settings?.offboard?.calendar_title || '[퇴사] {{소속}} / {{이름}}', 퇴직값들(rec, settings));
  const d = (ymd) => ymd.replace(/-/g, '');
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: `${제목} — 퇴사일`, dates: `${d(rec.leave_day)}/${d(날더하기(rec.leave_day, 1))}`,
    details: `마지막 근무일 ${글(rec.last_day) || '미정'} · 퇴사일 ${rec.leave_day}`,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// 모두싸인 엑셀을 만들 수 없는 까닭(빈 값 이름). 만들 수 있으면 ''.
export function 퇴직서류막힘(rec) {
  const 입사 = 글(rec?.join_date) || 글(rec?.group_join_date);
  const 빠짐 = [['이름', 글(rec?.name)], ['회사 이메일', 글(rec?.email)], ['입사일', 날꼴.test(입사) ? 입사 : '']].filter(([, v]) => !v).map(([말]) => 말);
  return 빠짐.length ? `${빠짐.join('·')}이(가) 비어 있어 모두싸인 엑셀을 만들 수 없습니다.` : '';
}

const 됨 = (r) => r?.status === 'ok';

// 등록 서랍의 [미리보기] 와 상세 서랍이 쓰는 계획.
// rec: 퇴직자 기록(등록 전에는 results·slots 가 비어 있다). staffRow: 직원명부 줄 또는 null. orgRows: 조직도 줄.
// 돌려줌: { 지금할일:[{ id, label, where, blocked, done, 기본, preview }], 그날할일:[{ id, 때, label, 지남, 기본, blocked }], 고르기:{ 자리? }, 알림:[글] }
export function 계획만들기({ rec, settings, staffRow, orgRows, 지금 = new Date(), webhook = '' }) {
  const o = settings?.offboard ?? {};
  const 값 = 퇴직값들(rec, settings);
  const r = rec.results ?? {};
  const 마지막없음 = 날꼴.test(글(rec.last_day)) ? '' : '마지막 근무일을 적어야 할 수 있습니다.';
  const kind = 글(rec.notice_kind);
  const dm틀 = kind ? 글(o[`dm_${kind}`]) : '';
  const 알림 = [];

  const 지금할일 = [
    {
      id: 'roster-date', label: '직원명부 퇴사일 적기', where: `퇴사일 칸 ← ${rec.leave_day}`,
      blocked: staffRow ? '' : '직원명부에서 이 사람을 찾지 못했습니다.', 기본: true, preview: { text: rec.leave_day },
    },
    {
      id: 'hub-cal', label: '캘린더 일정 만들기', where: "이 달력의 '입·퇴사' 분야", blocked: 마지막없음, 기본: true,
      preview: { 일정: 일정들(rec, settings) },
    },
    {
      id: 'google-cal', label: '구글 캘린더에 넣기', where: '구글 캘린더가 새 탭으로 열립니다', blocked: 마지막없음, 기본: false,
      preview: { 일정: [{ date: rec.leave_day, title: `${fill(o.calendar_title || '[퇴사] {{소속}} / {{이름}}', 값)} — 퇴사일` }] },
    },
    {
      id: 'channel', label: '팀 피플 채널 공유', where: `${글(o.channel_name) || '채널 미정'} · ${webhook ? '슬랙에 바로 올림' : '문구 복사'}`,
      blocked: !글(o.channel) ? '설정에 팀 피플 채널 글이 없습니다.' : 마지막없음, 기본: true, preview: { text: fill(o.channel, 값) },
    },
    {
      id: 'dm', label: '안내 DM', where: `${값.이름} 님 · 문안 복사`,
      blocked: !kind ? '입사일을 몰라 문안을 고를 수 없습니다. 「안내 DM 문안」에서 직접 골라 주세요.'
        : !dm틀 ? `설정의 「${문안이름[kind]}」 문안이 비어 있어 보내지 않습니다.` : 마지막없음,
      기본: true, preview: { text: dm틀 ? fill(dm틀, 값) : '', kind, email: 글(rec.email) },
    },
    { id: 'modusign', label: '모두싸인 퇴직서류 엑셀', where: '엑셀을 내려받습니다', blocked: 퇴직서류막힘(rec), 기본: true, preview: {} },
  ].map((t) => ({ ...t, done: 됨(r[t.id]) }));

  // 그날 할 일: 조직도.
  const 자리 = 조직자리(orgRows, rec.name);
  const 고르기 = {};
  if (자리.본.length > 1 && !rec.org_row_id) 고르기.자리 = 자리.본.map((x) => ({ id: x.id, 경로: 칸경로(orgRows, x.parent_id) }));
  const 조직있음 = 자리.본.length > 0 || 자리.리더칸.length > 0;
  const 이미옮김 = !조직있음 && 자리.예정.length > 0;
  const 때 = (ymd) => `${ymd} ${그날시각}`;
  const 지남 = (ymd) => 날꼴.test(글(ymd)) && 지금.getTime() >= new Date(`${ymd}T${그날시각}:00+09:00`).getTime();
  const 없음 = '조직도에서 이 사람을 찾지 못했습니다.';
  const 그날할일 = [
    {
      id: 'org-first', 때: 날꼴.test(글(rec.last_day)) ? 때(rec.last_day) : '', label: '조직도 — 퇴직예정자 칸으로 옮기기',
      지남: 지남(rec.last_day), 기본: 이미옮김 ? 이미함 : 지금하기,
      blocked: 마지막없음 || (!조직있음 && !이미옮김 ? 없음 : ''),
    },
    {
      id: 'org-second', 때: 때(rec.leave_day), label: '조직도 — 퇴직예정자 칸에서 지우기',
      지남: 지남(rec.leave_day), 기본: 지금하기, blocked: !조직있음 && !이미옮김 ? 없음 : '',
    },
  ];
  if (!조직있음 && !이미옮김) 알림.push('조직도에 이 이름의 상자가 없어 조직도는 정리하지 않습니다.');
  if (자리.겸.length) 알림.push(`겸직 상자 ${자리.겸.length}개는 마지막 근무일에 함께 지웁니다.`);
  if (자리.리더칸.length) 알림.push(`리더로 적힌 칸(${자리.리더칸.map((u) => 글(u.name)).join(', ')})의 리더 자리는 마지막 근무일에 비웁니다.`);
  if (!staffRow) 알림.push('직원명부에서 사람을 찾지 못해 퇴사일을 적을 수 없습니다.');
  알림.push('직원명부는 퇴사일이 지나면 저절로 퇴사자로 넘어갑니다.');
  return { 지금할일, 그날할일, 고르기, 알림 };
}

// 체크칸의 처음 상태. 담당자가 손으로 켠 것(on)·끈 것(off)만 기억하고 나머지는 기본을 따른다.
export function 고른할일(tasks, 손 = {}) {
  const on = 손.on ?? new Set();
  const off = 손.off ?? new Set();
  return new Set((tasks ?? []).filter((t) => !t.done && !t.blocked).filter((t) => (t.기본 && !off.has(t.id)) || on.has(t.id)).map((t) => t.id));
}

// 그날 할 일 시간표 줄. 두 날이 같으면 첫 예약은 '그날'.
export function 시간표(items, rec) {
  const 같은날 = Boolean(글(rec?.last_day)) && 글(rec?.last_day) === 글(rec?.leave_day);
  return (items ?? []).map((t) => {
    const [날짜 = '', 시각 = ''] = 글(t.때).split(' ');
    const 앞 = t.id === 'org-first' ? (같은날 ? '그날' : '마지막 근무일') : '실퇴직일';
    return { ...t, 머리: `${앞} ${시각}`.trim(), 날: 날짜, 고를까: Boolean(t.지남) && !t.blocked };
  });
}

// 날짜가 지난 줄에 대한 답 — 담당자가 고른 값이 없으면 기본값.
export function 지난것고름(rows, 고름 = {}) {
  const out = {};
  for (const r of rows ?? []) {
    if (!r.고를까) continue;
    out[r.id] = 고름[r.id] === 이미함 || 고름[r.id] === 지금하기 ? 고름[r.id] : r.기본;
  }
  return out;
}

// [등록하고 실행] 확인창 목록 — 실제로 일어날 일.
export function 확인줄들(tasks, picked, rows, 고름 = {}) {
  const past = 지난것고름(rows, 고름);
  return [
    ...(tasks ?? []).filter((t) => picked?.has(t.id)).map((t) => `지금 — ${t.label}`),
    ...(rows ?? []).map((r) => {
      if (r.blocked) return `하지 않음 — ${r.label} (${r.blocked})`;
      if (past[r.id] === 이미함) return `이미 함 — ${r.label}`;
      if (past[r.id] === 지금하기) return `지금 — ${r.label}`;
      return `${r.때} — ${r.label}`;
    }),
  ];
}

// ── 상태와 점 ──
// 꼴: ok(됨) · bad(손이 가야 함) · off(안 하기로 됨) · todo(아직·기다림)
const 상태 = {
  ok: ['ok', '됨'], done: ['ok', '끝남'], already: ['ok', '이미 함'],
  failed: ['bad', '실패'], blocked: ['bad', '막힘'], stale: ['bad', '다시 해야 함'], expired: ['bad', '날짜 지남 — 골라 주세요'],
  skipped: ['off', '건너뜀'], reverted: ['off', '되돌림'], waiting: ['todo', '기다림'], '': ['todo', '아직 안 함'],
};
export function 상태보기(status) {
  const [꼴, 말] = 상태[글(status)] ?? ['off', 글(status)];
  return { 꼴, 말 };
}

// 목록 줄의 점: 지금 할 일 여섯은 늘, 그날 할 일은 걸린 것만.
export function 점들(rec) {
  const 점 = (id, status) => { const s = 상태보기(status); return { id, 이름: 짧은이름[id], 꼴: s.꼴, 말: `${짧은이름[id]} ${s.말}` }; };
  return [
    ...지금할일들.map((id) => 점(id, rec?.results?.[id]?.status)),
    ...그날할일들.filter((id) => rec?.slots?.[id]?.status).map((id) => 점(id, rec.slots[id].status)),
  ];
}

// 실행 결과 { 대상: { status, 말 } } → 지금 할 일 차례의 줄과 셈.
export function 결과줄들(results = {}) {
  const 줄 = Object.keys(results).sort((a, b) => 지금할일들.indexOf(a.replace(/-again$/, '')) - 지금할일들.indexOf(b.replace(/-again$/, ''))).map((id) => {
    const s = 상태보기(results[id]?.status);
    const 원 = id.replace(/-again$/, '');
    return { id, 이름: `${짧은이름[원] ?? 원}${id.endsWith('-again') ? ' 한 번 더' : ''}`, 꼴: s.꼴, 상태: s.말, 말: 글(results[id]?.말) || s.말 };
  });
  return { 줄, 못함: 줄.filter((x) => x.꼴 === 'bad').length };
}

// 상세 서랍의 다시 실행 목록(모두싸인은 엑셀 받기 단추가 맡는다).
//   할수: 고를 수 있는가. 기본: 해 봤는데 안 된 것은 켜 둔다. 다시보내기: 이미 보낸 채널·DM 을 한 번 더.
const 다시켤상태 = ['failed', 'blocked', 'stale'];
export function 다시할일(items, results = {}) {
  return 지금할일들.filter((id) => id !== 'modusign').map((id) => {
    const t = (items ?? []).find((x) => x.id === id) ?? { id, blocked: '' };
    const status = 글(results?.[id]?.status);
    const 끝 = status === 'ok';
    const 막힘 = 글(t.blocked);
    return {
      id, label: 글(t.label) || 짧은이름[id],
      할수: !끝 && !막힘, 기본: !끝 && !막힘 && 다시켤상태.includes(status),
      다시보내기: 끝 && !막힘 && (id === 'channel' || id === 'dm'),
      까닭: 끝 ? '' : 막힘,
    };
  });
}

// 지울 때 되돌릴 수 있는 일 — 그 일을 했을 때만 체크칸을 보인다.
export function 되돌릴것(rec) {
  const r = rec?.results ?? {};
  return {
    퇴사일: r['roster-date']?.status === 'ok' || r['roster-date']?.status === 'stale',
    일정: (r['hub-cal']?.refs ?? []).length > 0,
    조직도: 그날할일들.some((id) => rec?.slots?.[id]?.status === 'done'),
  };
}

// ── 목록 ──
// 아직 안 나간 사람(실퇴직일 ≥ 오늘)은 가까운 순, 나간 사람은 그 뒤에 최근 순, 날짜가 없으면 맨 뒤.
export function 목록차례(rows, 오늘) {
  const 묶음 = (r) => (!글(r.data.leave_day) ? 2 : 글(r.data.leave_day) >= 오늘 ? 0 : 1);
  return [...(rows ?? [])].sort((a, b) => {
    const [x, y] = [묶음(a), 묶음(b)];
    if (x !== y) return x - y;
    const [p, q] = [글(a.data.leave_day), 글(b.data.leave_day)];
    return x === 0 ? p.localeCompare(q) : q.localeCompare(p);
  });
}

// 실퇴직일까지 남은 날. 'D-3' · '오늘' · '지남'.
export function 남은날글(ymd, 오늘) {
  if (!날꼴.test(글(ymd))) return '';
  const n = Math.round((날(ymd) - 날(오늘)) / 86400000);
  return n > 0 ? `D-${n}` : n === 0 ? '오늘' : '지남';
}

// 예약 때('YYYY-MM-DD HH:MM', 한국 시간)가 지났는가.
export const 때지남 = (때, 지금 = new Date()) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(글(때)) && 지금.getTime() >= new Date(`${때.replace(' ', 'T')}:00+09:00`).getTime();

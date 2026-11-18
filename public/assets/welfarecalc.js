// 복지카드 이번 달 명단 계산·발급현황 비교·파일 이름 — 순수 함수만. 화면·저장소 없이 쓴다.
// 날짜는 모두 'YYYY-MM-DD' 글자로 다룬다(기계의 시간대에 기대지 않는다).
// 주민번호는 여기에 오지 않는다. 카드번호는 발급현황 비교(브라우저 안)에서만 지나가고 남기지 않는다.

const 두자리 = (n) => String(n).padStart(2, '0');
const 글 = (v) => (v == null ? '' : String(v).trim());

export const 사번정리 = (v) => 글(v).replace(/\s+/g, '').toUpperCase();
const 사번인가 = (s) => s.length > 0 && s.length <= 20 && /^[A-Z]{0,3}\d+/.test(s);

// 'YYYY-MM-DD'·'YYYY.MM.DD'·'YYYY. M. D'·엑셀 날짜 숫자·'2026-11-20T…' → 'YYYY-MM-DD'. 못 읽으면 ''.
export function 날짜정리(v) {
  if (v == null) return '';
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(글(v))) {
    const n = Math.floor(Number(v));
    if (!(n > 20000 && n < 80000)) return '';
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/.exec(글(v));
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${두자리(mo)}-${두자리(d)}`;
}

export const 달더하기 = (ym, 수) => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + 수;
  return `${Math.floor(t / 12)}-${두자리((t % 12) + 1)}`;
};
const 날수 = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export const 지난달 = (ym) => 달더하기(ym, -1);
export const 다음달 = (ym) => 달더하기(ym, 1);
export const 월첫날 = (ym) => `${ym}-01`;
export const 월끝 = (ym) => `${ym}-${두자리(날수(ym))}`;
export const 월글 = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

// 20일 이후에 만들면 다음 달 자료로 본다.
export function 대상월기본(todayIso) {
  const ym = todayIso.slice(0, 7);
  return Number(todayIso.slice(8, 10)) >= 20 ? 달더하기(ym, 1) : ym;
}

// 금액 규칙. 입사 n년이 지나면 우대 금액(2월 29일 입사는 평년에 2월 28일로 본다).
export const 기본규칙 = { 기본: 250000, 우대: 275000, 우대년수: 3 };

function 년뒤(날, n) {
  const [y, m, d] = 날.split('-').map(Number);
  const ym = `${y + n}-${두자리(m)}`;
  return `${ym}-${두자리(Math.min(d, 날수(ym)))}`;
}

export function 근속금액(그룹입사일, ym, 규칙 = 기본규칙) {
  const r = { ...기본규칙, ...(규칙 ?? {}) };
  const 날 = 날짜정리(그룹입사일);
  return 날 && 년뒤(날, r.우대년수) <= 월끝(ym) ? r.우대 : r.기본;
}

export function 전체휴직인가(p, ym) {
  const 시작 = 날짜정리(p.휴직시작);
  const 종료 = 날짜정리(p.휴직종료);
  return !!시작 && 시작 <= 월첫날(ym) && (!종료 || 종료 >= 월끝(ym));
}

// 직원명부 기록(staffview 의 칸 이름) → 여기서 쓰는 줄. 그룹입사일이 비면 입사일로 본다.
export function 명부줄(s, 법인 = '') {
  return {
    사번: s.emp_no, 이름: s.name, 법인: s.corp || 법인, 실: s.dept, 팀: s.team, 파트: s.part, 직책: s.title,
    입사일: s.joined, 그룹입사일: s.group_joined || s.joined, 퇴사일: s.left, 휴직시작: s.leave_from, 휴직종료: s.leave_to, 이메일: s.email,
  };
}

const 칸값 = (v) => { const s = 글(v); return s === '-' ? '' : s; };
const 월일 = (날) => `${Number(날.slice(5, 7))}/${Number(날.slice(8, 10))}`;

// 직원명부에서 같은 사번이 둘이면 퇴사일 없는 줄, 없으면 퇴사일이 늦은 줄.
function 사번별(roster) {
  const 지도 = new Map();
  for (const p of roster) {
    const 사번 = 사번정리(p.사번);
    if (!사번) continue;
    const 옛 = 지도.get(사번);
    const 퇴 = 날짜정리(p.퇴사일);
    if (!옛) { 지도.set(사번, p); continue; }
    const 옛퇴 = 날짜정리(옛.퇴사일);
    if (옛퇴 && (!퇴 || 퇴 > 옛퇴)) 지도.set(사번, p);
  }
  return 지도;
}

function 이슈글(p, ym) {
  const [처음, 끝] = [월첫날(ym), 월끝(ym)];
  const 안 = (d) => d && d >= 처음 && d <= 끝;
  const 퇴 = 날짜정리(p.퇴사일), 시 = 날짜정리(p.휴직시작), 종 = 날짜정리(p.휴직종료);
  return [안(퇴) && `${월일(퇴)} 퇴사`, 안(시) && `휴직 ${월일(시)}~`, 안(종) && `휴직 ~${월일(종)}`]
    .filter(Boolean).join(', ');
}

function 줄만들기(p, ym, 규칙) {
  return {
    사번: 사번정리(p.사번), 이름: 글(p.이름), 소속: 글(p.법인),
    실: 칸값(p.실) || '-', 부서: 칸값(p.팀) || '-', 파트: 칸값(p.파트) || '-', 직책: 칸값(p.직책),
    입사일: 날짜정리(p.그룹입사일), 금액: 근속금액(p.그룹입사일, ym, 규칙), 이슈: 이슈글(p, ym),
  };
}

// 사번 직접 추가 — 명부에서 그 사번의 줄을 이번 달 줄로. 없으면 null.
export function 한사람줄(roster, 사번, ym, 규칙) {
  const p = 사번별(roster || []).get(사번정리(사번));
  return p ? 줄만들기(p, ym, 규칙) : null;
}

// 발급 및 해지내역에 적을 조직 — 사번 → {소속,실,부서,파트}. 없으면 null.
export function 조직찾기(roster) {
  const 명부 = 사번별(roster || []);
  return (사번) => {
    const p = 명부.get(사번정리(사번));
    if (!p) return null;
    return { 소속: 칸값(p.법인) || '-', 실: 칸값(p.실) || '-', 부서: 칸값(p.팀) || '-', 파트: 칸값(p.파트) || '-' };
  };
}

// 두 파일이 바이트까지 같은가 — 직전 발급현황을 그대로 다시 올렸는지 본다.
export function 같은파일인가(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

// 사번 → 이름. 없으면 ''.
export function 이름찾기(roster) {
  const 명부 = 사번별(roster || []);
  return (사번) => 글(명부.get(사번정리(사번))?.이름);
}

// 평가 현황의 수습평가에서 모든 단계를 끝낸 사람 = 수습 통과자. 통과일은 마지막 단계의 마감(없으면 '').
export function 수습통과자(lists) {
  const people = [];
  for (const l of lists ?? []) {
    if (l?.kind !== 'probation') continue;
    for (const p of l.people ?? []) {
      const steps = Array.isArray(p.steps) ? p.steps : [];
      if (!steps.length || !steps.every((s) => s?.state === 'done' || s?.state === 'skip')) continue;
      const 마지막 = [...steps].reverse().find((s) => 날짜정리(s?.due));
      people.push({ name: p.name, email: p.email || '', passedAt: 마지막 ? 날짜정리(마지막.due) : '' });
    }
  }
  return { ok: true, people };
}

export function 명단계산({ prev, roster, passed, exclude, ym, 규칙 }) {
  const 처음 = 월첫날(ym), 지난처음 = 월첫날(지난달(ym)), 끝 = 월끝(ym);
  // 수습 통과 체크 기준은 지지난달 1일부터 — 지난번 명단을 만든 날과 그달 말일 사이에 통과한 사람이
  // 다음 달에 풀리지 않게 한 달 더 넓힌다. 그보다 앞선 통과는 날짜를 보여 주고 체크하지 않는다.
  const 수습기준 = 월첫날(지난달(지난달(ym)));
  const 명부 = 사번별(roster || []);
  const 제외 = exclude || new Set();
  const 재직 = (p) => { const 퇴 = 날짜정리(p.퇴사일); return !퇴 || 퇴 >= 처음; };
  const 항상제외 = (p) => 제외.has(사번정리(p.사번));
  const 줄로 = (p) => 줄만들기(p, ym, 규칙);

  const 결과 = { 계속: [], 빠짐: [], 추가: [], 참고: [], 금액바뀜: [], 경고: [] };
  const 지난 = new Set();

  for (const q of prev || []) {
    if (지난.has(q.사번)) continue;
    지난.add(q.사번);
    const p = 명부.get(q.사번);
    const 빠짐 = (이유, 줄) => 결과.빠짐.push({
      사번: q.사번, 이름: p ? 글(p.이름) : (q.이름 || ''), 이유,
      row: 줄 || { 사번: q.사번, 이름: q.이름 || '', 소속: '', 실: '-', 부서: '-', 파트: '-', 직책: '', 입사일: '', 금액: q.금액, 이슈: q.이슈 || '' },
    });
    if (제외.has(q.사번)) { 빠짐('항상 제외', p && 줄로(p)); continue; }
    if (!p) { 빠짐('직원명부에 없음'); continue; }
    const 줄 = 줄로(p);
    if (!재직(p)) { 빠짐(`퇴사(${날짜정리(p.퇴사일)})`, 줄); continue; }
    if (전체휴직인가(p, ym)) { 빠짐('한 달 내내 휴직', 줄); continue; }
    결과.계속.push(줄);
    if (Number(q.금액) !== 줄.금액) 결과.금액바뀜.push({ 사번: q.사번, 이름: 줄.이름, 전: Number(q.금액), 후: 줄.금액 });
  }

  const 후보 = new Set();
  const 받을수있나 = (p) => 재직(p) && !항상제외(p) && !전체휴직인가(p, ym);

  // 복직 — 휴직이 지난달 첫날~이번 달 끝 사이에 끝난 사람
  const 복직들 = [...명부.values()].filter((p) => {
    const 종 = 날짜정리(p.휴직종료);
    return !지난.has(사번정리(p.사번)) && 종 >= 지난처음 && 종 <= 끝 && 받을수있나(p);
  }).sort((a, b) => (사번정리(a.사번) < 사번정리(b.사번) ? -1 : 1));
  for (const p of 복직들) {
    const 사번 = 사번정리(p.사번);
    후보.add(사번);
    결과.추가.push({ 사번, 이름: 글(p.이름), 종류: '복직', 이유: `휴직 복귀(${날짜정리(p.휴직종료)})`, 체크: true, row: 줄로(p) });
  }

  // 수습 — 평가 현황의 수습평가를 끝낸 사람
  if (passed && passed.ok === false) {
    결과.경고.push(`평가 현황에서 수습 통과자를 받지 못했습니다.\n${글(passed.error)}`);
  } else if (passed && passed.ok) {
    const 이메일지도 = new Map();
    const 이름지도 = new Map();
    for (const p of 명부.values()) {
      if (!재직(p)) continue;
      const e = 글(p.이메일).toLowerCase();
      if (e) 이메일지도.set(e, p);
      const n = 글(p.이름).replace(/\s+/g, '');
      if (n) 이름지도.set(n, [...(이름지도.get(n) || []), p]);
    }
    const 본동명 = new Set();
    for (const x of passed.people || []) {
      const 통과날 = 날짜정리(x.passedAt);
      const 체크 = !!통과날 && 통과날 >= 수습기준;
      const 이유 = 체크 ? `수습평가 통과(${통과날})` : `지난달 명단에 없음 — 통과 ${통과날 || '날짜 모름'}`;
      let p = 이메일지도.get(글(x.email).toLowerCase());
      if (!p) {
        const n = 글(x.name).replace(/\s+/g, '');
        const 같은 = n ? 이름지도.get(n) || [] : [];
        if (같은.length > 1) {
          if (!본동명.has(n)) {
            본동명.add(n);
            결과.추가.push({ 사번: '', 이름: 글(x.name), 종류: '동명이인', 이유: '같은 이름이 둘 이상 — 사번을 직접 확인해 주세요', 체크: false, row: null });
          }
          continue;
        }
        p = 같은[0];
      }
      if (!p) continue;
      const 사번 = 사번정리(p.사번);
      if (지난.has(사번) || 후보.has(사번) || !받을수있나(p)) continue;
      후보.add(사번);
      결과.추가.push({ 사번, 이름: 글(p.이름), 종류: '수습', 이유, 체크, row: 줄로(p) });
    }
  }

  // 참고 — 후보는 아니지만 살펴볼 만한 사람
  for (const p of 명부.values()) {
    const 사번 = 사번정리(p.사번);
    if (지난.has(사번) || 후보.has(사번) || !받을수있나(p)) continue;
    const 입사 = 날짜정리(p.입사일), 그룹 = 날짜정리(p.그룹입사일);
    // 3개월은 그룹입사일로 센다 — 전적·재입사자는 입사일 칸이 새로 적히고 그룹입사일에 처음 입사가 남는다.
    const 기준 = 그룹 || 입사;
    const 석달 = 기준 && 달더하기(기준.slice(0, 7), 3) + 기준.slice(7) <= 처음;
    const 전적 = Boolean(입사 && 그룹 && 그룹 < 입사);
    if (!석달 && !전적) continue;
    const 이유 = 전적
      ? `전적·재입사 — 그룹입사 ${그룹}, 이번 입사 ${입사}`
      : '입사 3개월 지남 — 지난달 명단에 없고 수습 통과 기록도 없음';
    결과.참고.push({ 사번, 이름: 글(p.이름), 입사일: 입사, 그룹입사일: 그룹, 이유, row: 줄로(p) });
  }
  결과.참고.sort((a, b) => (a.사번 < b.사번 ? -1 : 1));
  return 결과;
}

// 지난달 명단이 하나도 없을 때(처음 쓸 때) 재직자 전원으로 첫 명단을 만든다.
export function 첫명단(roster, ym, 규칙, exclude = new Set()) {
  const 명부 = 사번별(roster || []);
  const 처음 = 월첫날(ym);
  return [...명부.values()]
    .filter((p) => { const 퇴 = 날짜정리(p.퇴사일); return (!퇴 || 퇴 >= 처음) && !exclude.has(사번정리(p.사번)) && !전체휴직인가(p, ym); })
    .map((p) => 줄만들기(p, ym, 규칙))
    .sort((a, b) => (a.사번 < b.사번 ? -1 : 1));
}

// 고른 대로 이번 달 명단을 만든다. 계속 + 살린 빠짐 + 고른 추가·참고(사번 순).
export function 최종명단(결과, { 빠짐살림, 추가, 금액그대로 }, prev) {
  const 지난금액 = new Map((prev || []).map((q) => [q.사번, Number(q.금액)]));
  const 고른 = new Map();
  for (const x of 결과.추가) if (x.row && 추가.has(x.사번)) 고른.set(x.사번, x.row);
  for (const x of 결과.참고) if (추가.has(x.사번) && !고른.has(x.사번)) 고른.set(x.사번, x.row);
  const 덧붙임 = [...고른.values()].sort((a, b) => (a.사번 < b.사번 ? -1 : 1));
  const 살림 = 결과.빠짐.filter((x) => 빠짐살림.has(x.사번)).map((x) => x.row);
  return [...결과.계속, ...살림, ...덧붙임].map((r) =>
    (금액그대로.has(r.사번) && 지난금액.has(r.사번) ? { ...r, 금액: 지난금액.get(r.사번) } : r));
}

export function 집계(rows) {
  const 지도 = new Map();
  let 합계 = 0;
  for (const r of rows) {
    합계 += r.금액;
    const 옛 = 지도.get(r.금액) || { 금액: r.금액, 인원: 0, 소계: 0 };
    옛.인원 += 1; 옛.소계 += r.금액;
    지도.set(r.금액, 옛);
  }
  return { 인원: rows.length, 합계, 금액별: [...지도.values()].sort((a, b) => b.금액 - a.금액) };
}

// 확정본으로 남길 때 쓰는 가벼운 줄(다음 달의 '지난달 명단').
export const 확정줄 = (rows) => rows.map((r) => ({ 사번: r.사번, 이름: r.이름, 금액: r.금액, 이슈: r.이슈 || '' }));

// ── 발급현황 비교(재무팀 공유용 발급 및 해지내역) ──
// 카드번호는 브라우저 안에서만 다룬다. 이 함수들은 받은 값을 어디에도 남기거나 찍지 않는다.

export const 카드칸 = ['카드번호', '상품명', '소지자명', '발급일자', '발급구분', '유효기한', '제휴카드ID'];

// 발급현황 시트 값줄 → 카드 목록. 머리글(카드번호…제휴카드ID)은 위쪽 5줄 안에서 찾고, 열은 이름으로 찾는다.
export function 카드읽기(값줄) {
  let 머리줄 = -1;
  for (let i = 0; i < Math.min(5, 값줄?.length ?? 0); i++) {
    if ((값줄[i] || []).map(글).includes('카드번호')) { 머리줄 = i; break; }
  }
  if (머리줄 < 0) throw new Error('발급현황 파일에서 머리글(카드번호)을 찾지 못했습니다');
  const 머리 = (값줄[머리줄] || []).map(글);
  const 자리 = 카드칸.map((이름) => 머리.indexOf(이름));
  const 없는 = 카드칸.filter((_, i) => 자리[i] < 0);
  if (없는.length) throw new Error(`발급현황 파일에서 머리글(${없는.join(', ')})을 찾지 못했습니다`);
  const out = [];
  for (const r of 값줄.slice(머리줄 + 1)) {
    const 카드 = {};
    카드칸.forEach((이름, i) => { 카드[이름] = 글(r?.[자리[i]]); });
    if (!카드.카드번호) continue;
    if (typeof r?.[자리[3]] === 'number') 카드.발급일자 = 날짜정리(r[자리[3]]);
    카드.제휴카드ID = 사번정리(카드.제휴카드ID);
    out.push(카드);
  }
  return out;
}

const 발급일순 = (가, 나) => (가.발급일자 < 나.발급일자 ? -1 : 가.발급일자 > 나.발급일자 ? 1 : 0);

// 지난번 → 이번 발급현황을 카드번호로 맞춰 본다.
// - 발급: 이번에 새로 생긴 카드.
// - 옛카드·해지: 지난번에 있다가 사라진 카드. 그 사번이 이번에도 카드를 갖고 있으면 바꿔 받은 것(옛카드), 아니면 해지다.
export function 발급비교(이전, 이번) {
  const 이전번호 = new Set(이전.map((c) => c.카드번호));
  const 이번번호 = new Set(이번.map((c) => c.카드번호));
  const 발급 = 이번.filter((c) => !이전번호.has(c.카드번호)).sort(발급일순);
  const 지금카드 = new Map();
  const 새번호 = new Set(발급.map((c) => c.카드번호));
  const 앞선다 = (가, 나) => (새번호.has(가.카드번호) !== 새번호.has(나.카드번호)
    ? 새번호.has(가.카드번호) : 가.발급일자 > 나.발급일자);
  for (const c of 이번) {
    if (!c.제휴카드ID) continue;
    const 옛 = 지금카드.get(c.제휴카드ID);
    if (!옛 || 앞선다(c, 옛)) 지금카드.set(c.제휴카드ID, c);
  }
  const 옛카드 = [];
  const 해지 = [];
  for (const c of 이전) {
    if (이번번호.has(c.카드번호)) continue;
    const 바꾼카드 = c.제휴카드ID && 지금카드.get(c.제휴카드ID);
    if (바꾼카드) 옛카드.push({ ...바꾼카드, 카드번호: c.카드번호 });
    else 해지.push(c);
  }
  return { 발급, 옛카드: 옛카드.sort(발급일순), 해지 };
}

// ── 파일 이름 ──
const 년월 = (ym) => [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];

export function 지급파일명(ym) {
  const [y, m] = 년월(ym);
  return `${y}년 ${m}월 복지카드 지급내역.xlsx`;
}
export function 한도파일명(ym, 회사 = '우리회사') {
  const [y, m] = 년월(ym);
  return `${y}년 ${m}월 (${회사})복지카드 한도설정.xlsx`;
}
// 만든 날의 지난달 것이다(12월 1일에 만들면 11월).
export function 발급해지파일명(todayIso) {
  const [y, m] = 년월(지난달(todayIso.slice(0, 7)));
  return `${String(y).slice(2)}년 ${m}월 복지카드 발급 및 해지내역.xlsx`;
}
export const 발급현황파일명 = (todayIso, 회사 = '우리회사') => `${todayIso.slice(2, 4)}${todayIso.slice(5, 7)}${todayIso.slice(8, 10)}_${회사}(발급현황).xlsx`;

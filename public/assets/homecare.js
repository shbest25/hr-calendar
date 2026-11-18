// 홈의 '자동화 현황' 카드에 들어갈 것. 계산만 한다 — 그리기는 homeview.js.
//
// 관리자가 홈에서 바로 보는 세 묶음이다.
//   신규 입사자  아직 끝나지 않은 사람, 입사일 순. 입사일이 지났는데 안 끝났으면 빨갛게.
//   예약        곧 저절로 나갈 것 — 기다리는 자동화 예약, 나갈 차례대로.
//   확인 필요    최근 14일 안에 제대로 안 된 것 — 자동화 실행 실패, 못 나간 예약.
// 받는 값은 기록 그대로다: hires = 'hire' 기록, runs = 'run' 기록, books = 'book' 기록(모두 { id, data }).
import { 때글 } from './autobook.js';

const 하루 = 86400000;
const 날수 = 14;
const 날꼴 = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' 둘 사이의 날 수(뒤 − 앞).
const 날차 = (앞, 뒤) => Math.round((Date.parse(`${뒤}T00:00:00Z`) - Date.parse(`${앞}T00:00:00Z`)) / 하루);
const 날글 = (iso) => 때글(iso).slice(0, 5);

// ── 신규 입사자 ──
// 돌려주는 것: { 줄: [{ id, name, dept, 날, 남은, 늦음, 알약, 결 }], 더 } — 결: 'go'(지금 할 일) · 'bad'(늦음) · 'done' · ''.
export function 입사자줄(rows, today, max = Infinity) {
  // 끝난 사람(명부 등재까지 마침)도 **입사일 당일까지는** 남긴다 — 곧 들어올 사람이 카드에서 사라지면 빠뜨린 줄 안다.
  const 볼것 = (rows ?? [])
    .map((r) => ({ id: r.id, ...r.data }))
    .filter((r) => r.stage !== 'done' || (날꼴.test(String(r.start_date ?? '')) && r.start_date >= today))
    .map((r) => ({ r, 날: 날꼴.test(String(r.start_date ?? '')) ? r.start_date : '' }))
    .sort((a, b) => (a.날 === '') - (b.날 === '') || a.날.localeCompare(b.날));
  const 줄 = 볼것.slice(0, max).map(({ r, 날 }) => {
    const 남은날 = 날 ? 날차(today, 날) : null;
    const 늦음 = 남은날 !== null && 남은날 < 0 && r.stage !== 'done';
    const 남은 = 남은날 === null ? '입사일 없음' : 남은날 === 0 ? '오늘' : 남은날 > 0 ? `D-${남은날}` : `${-남은날}일 지남`;
    const [알약, 결] = r.stage === 'done' ? ['등재 완료', 'done']
      : 늦음 ? ['명부 등재 안 함', 'bad'] : r.stage === 'enroll' ? ['명부 등재하기', 'go'] : ['입사 확정', ''];
    const 소속 = [r.dept, r.team, r.part, r.job].map((v) => String(v ?? '').trim()).filter((v) => v && v !== '-').join(' · ');
    return { id: r.id, name: r.name || '이름 없음', dept: 소속, 날: 날 ? `${날.slice(5, 7)}/${날.slice(8, 10)}` : '', 남은, 늦음, 알약, 결 };
  });
  return { 줄, 더: Math.max(0, 볼것.length - max) };
}

// ── 예약 ──
export function 예약줄(books, autos) {
  const 이름 = (id) => autos?.find((a) => a.id === id);
  return (books ?? [])
    .filter((b) => b.data.state === 'waiting' && !Number.isNaN(Date.parse(String(b.data.run_at ?? ''))))
    .sort((x, y) => Date.parse(x.data.run_at) - Date.parse(y.data.run_at))
    .map((b) => ({ id: `book:${b.id}`, kind: 'auto', autoId: b.data.auto, icon: 이름(b.data.auto)?.icon ?? 'app', 제목: 이름(b.data.auto)?.title ?? b.data.auto, 덧글: b.data.summary || '', 때: 때글(b.data.run_at) }));
}

// ── 확인 필요 ──
export function 확인줄(runs, books, autos, nowMs = Date.now()) {
  const 지금 = Number(nowMs);
  const 최근 = (ms) => !Number.isNaN(ms) && 지금 - ms <= 날수 * 하루;
  const 이름 = (id) => autos?.find((a) => a.id === id);
  const 줄 = [];
  for (const b of books ?? []) {
    if (b.data.state !== 'failed') continue;
    const 끝 = Date.parse(String(b.data.done_at || b.data.run_at || ''));
    if (!최근(끝)) continue;
    줄.push({ id: `book:${b.id}`, kind: 'auto', autoId: b.data.auto, icon: 이름(b.data.auto)?.icon ?? 'app', 제목: 이름(b.data.auto)?.title ?? b.data.auto,
      덧글: `${b.data.summary ? `${b.data.summary} — ` : ''}${날글(b.data.run_at)} 예약이 나가지 않았습니다${b.data.detail ? ` (${b.data.detail})` : ''}` });
  }
  // 자동화마다 마지막 실행이 실패면 한 줄.
  const 마지막 = new Map();
  for (const r of runs ?? []) {
    const 옛 = 마지막.get(r.data.auto);
    if (!옛 || String(r.data.at) > String(옛.data.at)) 마지막.set(r.data.auto, r);
  }
  for (const [autoId, r] of 마지막) {
    if (r.data.ok) continue;
    const 때 = Date.parse(String(r.data.at ?? ''));
    if (!최근(때)) continue;
    줄.push({ id: `run:${r.id}`, kind: 'auto', autoId, icon: 이름(autoId)?.icon ?? 'app', 제목: 이름(autoId)?.title ?? autoId,
      덧글: `${날글(r.data.at)} 실행 실패${r.data.detail ? ` — ${r.data.detail}` : ''}` });
  }
  return 줄;
}

// 카드를 처음 열 때 고를 탭. 놓치면 안 되는 것부터: 확인 필요 → 신규 입사자 → 예약.
export function 첫탭(care) {
  if (care?.확인?.length) return '확인';
  if (care?.입사자?.줄?.length) return '입사자';
  if (care?.예약?.length) return '예약';
  return '입사자';
}

// 세 묶음을 한 번에. 못 받은 재료(null)의 묶음은 null 이다 — 화면이 '못 불러왔다' 고 적는다.
export function 챙길것({ hires, runs, books, autos }, today, nowMs = Date.now()) {
  const 입사자 = hires === null ? null : 입사자줄(hires, today);
  const 예약 = books === null ? null : 예약줄(books, autos);
  const 확인 = runs === null && books === null ? null : 확인줄(runs ?? [], books ?? [], autos, nowMs);
  return { 입사자, 예약, 확인 };
}

// ── 오늘 할 일 ──
// 오늘 기한인 것과 지난 것을 함께 본다 — 지난 것이 가장 먼저 보여야 한다.
// 끝낸 것은 빼되, 오늘 끝낸 것은 남겨 둔다(방금 체크한 것이 눈앞에서 사라지면 잘못 누른 줄 안다).
// 지난 것은 최근 며칠치만 본다. 그래도 많으면 여덟 칸에서 끊고 나머지는 '몇 건 더' 로 접어 캘린더로 보낸다.
export function 날더하기(ymd, n) {
  const ms = Date.parse(`${ymd}T00:00:00Z`) + n * 하루;
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayTasks(items, today, { lateDays = 7, max = 8 } = {}) {
  const from = 날더하기(today, -Math.max(0, lateDays));
  const out = [];
  for (const it of items ?? []) {
    const due = String(it.due ?? '');
    if (!due || due > today || due < from) continue;
    if (it.done && due !== today) continue;
    out.push({ ...it, late: due < today });
  }
  out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : String(a.title).localeCompare(String(b.title), 'ko')));
  return { list: out.slice(0, max), more: Math.max(0, out.length - max) };
}

// 오늘 할 일을 고르려고 받을 달들. 지난 며칠이 지난달에 걸치면 지난달도 받는다.
export function 받을달들(today, lateDays = 7) {
  const 이번달 = String(today).slice(0, 7);
  const 지난날 = 날더하기(today, -Math.max(0, lateDays)).slice(0, 7);
  return 지난날 < 이번달 ? [지난날, 이번달] : [이번달];
}

// 여러 달 목록을 잇는다. 같은 일정·같은 기한은 한 번만 둔다.
export function 일정합치기(lists) {
  const 본것 = new Set();
  const out = [];
  for (const list of lists ?? []) {
    for (const it of list ?? []) {
      const key = `${it.id}|${it.due}`;
      if (본것.has(key)) continue;
      본것.add(key);
      out.push(it);
    }
  }
  return out;
}

// 이번 주(7일 안) 기한 수 — 오늘이 비었을 때 '이번 주 n건' 으로 적는다.
export function 이번주수(items, today) {
  const week = 날더하기(today, 7);
  return (items ?? []).filter((it) => it.due > today && it.due <= week && !it.done).length;
}

// 체크하기 전에 묻는 글. 줄을 잘못 눌러 끝나지 않은 일이 '했어요' 로 적히던 것을 막는다.
export function 완료묻기글(it) {
  return {
    title: `「${it?.title ?? ''}」 업무를 완료했나요?`,
    message: '완료로 체크하면 캘린더에도 했어요로 적힙니다.',
    confirm: '완료했어요',
  };
}

// 할 일 줄 끝에 적는 날짜. 연도는 빼고 줄인다.
export function 할일날짜(due) {
  const d = String(due ?? '');
  return d.length >= 10 ? `${d.slice(5, 10)} 기한` : '';
}

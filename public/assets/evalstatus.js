// 평가 현황 화면의 계산. DOM 을 모르는 순수 함수만 둔다.
//
// 자료 모양(records 의 'eval' 기록 하나, id = EVAL_ID):
//   { lists: [{ id, name, kind, period, link, notif: { blocked, why }, stages: [{ key, label }],
//               people: [{ id, name, org, sub, steps: [{ state, due, evaluator, reminded_at }] }] }] }
//   · state 는 todo(아직) · now(지금 써야 함) · wait(확정 대기) · done(끝남) · skip(해당 없음).
//   · '마감 지남(late)' 은 저장하지 않는다 — now 인데 due 가 오늘보다 앞이면 화면에서 late 로 본다.
//   · 평가 내용(답·등급·점수)은 담지 않는다. 누가·어느 단계·어떤 상태·마감만.
import { DATE, 짧은날짜 } from './autotext.js';

export const 종류이름 = { probation: '수습평가', cycle: '주기 평가', regular: '정기 인사평가', other: '그 밖' };
const 종류차례 = ['probation', 'cycle', 'regular', 'other'];
export const 상태이름 = { done: '끝남', wait: '확정 대기', now: '지금', late: '마감 지남', todo: '아직', skip: '해당 없음' };
export const 고를상태 = [['todo', '아직'], ['now', '지금 작성'], ['wait', '확정 대기'], ['done', '끝남'], ['skip', '해당 없음']];
export const 최대건수 = 50;

const 날수 = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);

// 저장된 단계 → 화면 상태(late 를 계산해 넣는다).
export function 단계상태(step, today) {
  const s = step?.state ?? 'todo';
  if (s === 'now' && DATE.test(step?.due ?? '') && step.due < today) return 'late';
  return s;
}

// 사람 하나를 화면이 쓰는 모양으로: steps 의 state 를 계산하고 status·remind 를 붙인다.
export function 사람정리(person, stages, today) {
  const steps = (stages ?? []).map((_, i) => {
    const raw = person.steps?.[i] ?? {};
    return { ...raw, state: 단계상태(raw, today) };
  });
  let status = { text: '끝남', tone: 'done' };
  const late = steps.findIndex((s) => s.state === 'late');
  const first = steps.findIndex((s) => s.state !== 'done' && s.state !== 'skip');
  const at = late >= 0 ? late : first;
  if (at >= 0) {
    const label = stages[at]?.label ?? '';
    const s = steps[at];
    if (s.state === 'late') status = { text: `${label} ${날수(today, s.due)}일 지남`, tone: 'late' };
    else if (s.state === 'now') status = { text: `${label} 작성 전`, tone: 'now' };
    else if (s.state === 'wait') status = { text: `${label} 확정 대기`, tone: 'wait' };
    else status = { text: `${label} 시작 전`, tone: 'todo' };
  }
  // 지금 리마인드할 평가표: 써야 하는 단계(지금·마감 지남)마다 한 건. 평가자가 없으면 본인이 쓰는 단계다.
  const remind = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.state === 'now' || s.state === 'late')
    .map(({ s, i }) => ({ step: i, label: stages[i]?.label ?? '', to: s.evaluator || person.name, due: s.due || '' }));
  return { ...person, steps, status, remind };
}

export function 평가정리(list, today) {
  const stages = Array.isArray(list.stages) ? list.stages : [];
  return { ...list, notif: list.notif ?? { blocked: false, why: '' }, stages, people: (list.people ?? []).map((p) => 사람정리(p, stages, today)) };
}

// 종류별 묶음. 빈 묶음은 뺀다.
export function 종류묶음(lists) {
  const 묶음 = new Map(종류차례.map((k) => [k, []]));
  for (const l of lists ?? []) 묶음.get(종류차례.includes(l?.kind) ? l.kind : 'other').push(l);
  return 종류차례.filter((k) => 묶음.get(k).length).map((k) => ({ kind: k, label: 종류이름[k], lists: 묶음.get(k) }));
}

export const 알약색 = (person) => person?.status?.tone ?? 'now';

export function 상태셈(people) {
  const 셈 = { all: 0, late: 0, wait: 0, now: 0, done: 0, todo: 0 };
  for (const p of people ?? []) { 셈.all += 1; const t = 알약색(p); if (t in 셈) 셈[t] += 1; }
  return 셈;
}

const 고르게 = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, '');
const 걸린상태 = new Set(['now', 'late', 'wait']);

// 찾기(이름·조직·보조줄·상태 글·걸린 단계 이름)와 상태 거르기.
export function 거르기(list, { q = '', tone = 'all' } = {}) {
  const 말 = 고르게(q);
  return (list?.people ?? []).filter((p) => {
    if (tone !== 'all' && 알약색(p) !== tone) return false;
    if (!말) return true;
    const 단계들 = p.steps.map((s, i) => (걸린상태.has(s.state) ? list.stages[i]?.label : '')).filter(Boolean);
    return [p.name, p.org, p.sub, p.status?.text, ...단계들].some((v) => 고르게(v).includes(말));
  });
}

export const 고를수있나 = (person) => Array.isArray(person?.remind) && person.remind.length > 0;

export function 마감지난사람들(list) {
  return (list?.people ?? []).filter((p) => 고를수있나(p) && p.steps.some((s) => s.state === 'late')).map((p) => p.id);
}

// 고른 사람에게 보낼 평가표. 받는 사람은 한 번씩만 센다.
export function 보낼것(list, 고른것) {
  const items = [];
  const 받는사람 = [];
  let 사람수 = 0;
  for (const p of list?.people ?? []) {
    if (!고른것?.has(p.id) || !고를수있나(p)) continue;
    사람수 += 1;
    for (const r of p.remind) {
      items.push({ personId: p.id, name: p.name, step: r.step, label: r.label, to: r.to, due: r.due });
      if (r.to && !받는사람.includes(r.to)) 받는사람.push(r.to);
    }
  }
  return { items, 사람수, 받는사람 };
}

export function 막힌까닭(list, 건수) {
  if (list?.notif?.blocked) return list.notif.why ? `리마인드를 보낼 수 없습니다 — ${list.notif.why}` : '이 평가는 알림이 꺼져 있어 리마인드를 보낼 수 없습니다';
  if (!건수) return '보낼 사람을 먼저 골라 주세요';
  if (건수 > 최대건수) return `한 번에 ${최대건수}건까지 보낼 수 있습니다 — 지금 ${건수}건`;
  return '';
}

// 받는 사람마다 한 덩이의 슬랙 글. 이름 앞에 @ 를 붙여 멘션처럼 적는다(실제 멘션은 슬랙에서 고른다).
export function 리마인드글(list, items, 회사) {
  const 묶음 = new Map();
  for (const it of items) {
    if (!묶음.has(it.to)) 묶음.set(it.to, []);
    묶음.get(it.to).push(it);
  }
  return [...묶음].map(([to, rows]) => ({
    to,
    text: [`*[평가 리마인드] ${list.name}${list.period ? ` (${list.period})` : ''}*`,
      `@${to} 님, 아래 평가표 작성을 부탁드립니다. 🙏`,
      ...rows.map((r) => `• ${r.name === to ? '본인' : r.name} — ${r.label}${r.due ? ` (마감 ${짧은날짜(r.due)})` : ''}`),
      list.link ? `👉 ${list.link}` : '', 회사 ? `— ${회사}` : ''].filter(Boolean).join('\n'),
  }));
}

// 점 사이 선. 칸 i→i+1 선은 칸 i 가 끝났거나(확정 대기 포함), 해당 없음이면 그 앞 선이 켜져 있으면 켠다.
export function 연결선(steps) {
  const n = steps?.length ?? 0;
  const 켬 = [];
  for (let i = 0; i < n - 1; i += 1) {
    const s = steps[i]?.state;
    켬.push(s === 'done' || s === 'wait' || (s === 'skip' && i > 0 && 켬[i - 1]));
  }
  return Array.from({ length: n }, (_, i) => ({ 왼: i > 0 && 켬[i - 1], 오: i < n - 1 && 켬[i] }));
}

export function 짧은날(due) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(due ?? ''));
  return m ? `${Number(m[1])}/${Number(m[2])}` : '';
}

export function 단계풍선(stage, step) {
  return [stage?.label, 상태이름[step?.state] ?? '', step?.due ? `${짧은날(step.due)} 마감` : '', step?.evaluator ? `평가자 ${step.evaluator}` : '']
    .filter(Boolean).join(' · ');
}

export const 큰카드인가 = (list) => (list?.people?.length ?? 0) >= 8;

// 단계 글(한 줄에 하나) → stages. 옛 key 는 자리대로 지키고 새 줄은 새 key 를 받는다.
export function 단계읽기(text, old = []) {
  const labels = String(text ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  return labels.map((label, i) => ({ key: old[i]?.key || `st_${Date.now().toString(36)}_${i}`, label }));
}

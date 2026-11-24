// 퇴직자 화면이 같이 쓰는 그림 조각(2026-11-23): 잔여연차 근거 표, 알림 묶음, 할 일 미리보기, 계획 칸, 결과 칸.
// 계산은 offboardcalc.js(순수 함수)가 하고 여기서는 그리기와 고른 것 모으기만 한다.
import { el } from './dom.js';
import { icon } from './icons.js';
import { bubble } from './ui.js';
import {
  근거줄, 근거펼침, 문안이름, 문장나누기, 고른할일, 시간표, 지난것고름, 확인줄들, 결과줄들, 상태보기, 짧은이름, 지금하기, 이미함,
} from './offboardcalc.js';

export const kv = (label, value) => el('div', { class: 'kv' }, el('span', {}, label), el('b', {}, value));
export const 상태점 = (꼴, 말) => el('span', { class: `hire-pip ${꼴}` }, 말);

// 알림 글 묶음. 한 줄에 하나.
export function 알림칸(알림) {
  const 줄 = (알림 ?? []).filter(Boolean);
  if (!줄.length) return null;
  return el('div', { class: 'ob-notes' }, icon('info'), el('ul', {}, 줄.map((t) => el('li', {}, 문장나누기(t)))));
}

const 작은표 = (머리, 줄) => el('table', { class: 'ob-basis-table' },
  el('thead', {}, el('tr', {}, 머리.map((h) => el('th', { scope: 'col' }, h)))),
  el('tbody', {}, 줄.map((r) => el('tr', {}, r.map((v) => el('td', {}, v))))));

// 잔여연차 근거 표. 줄마다 ▸ 를 누르면 그 숫자가 어디서 왔는지 펼친다.
// 열림: 펼친 줄의 이름 모음 — 다시 그려도(조정을 고쳐 다시 셀 때) 펼친 채로 둔다.
export function 근거칸(잔여, 열림 = new Set()) {
  if (!잔여) return null;
  const 펼침 = 근거펼침(잔여);
  return el('dl', { class: 'ob-basis' }, 근거줄(잔여).map((r) => {
    const p = 펼침[r.k];
    const 칸 = el('dd', { class: 'ob-basis-detail', hidden: !열림.has(r.k) },
      p.글.map((t) => el('p', {}, t)),
      p.표 ? 작은표(p.표.머리, p.표.줄) : null);
    const 단추 = el('button', {
      type: 'button', class: 'ob-basis-toggle', 'aria-expanded': String(열림.has(r.k)),
      onclick: () => {
        const 연다 = 단추.getAttribute('aria-expanded') !== 'true';
        단추.setAttribute('aria-expanded', String(연다));
        칸.hidden = !연다;
        if (연다) 열림.add(r.k); else 열림.delete(r.k);
      },
    }, el('span', { class: 'ob-caret', 'aria-hidden': 'true' }, '▸'), r.k);
    return el('div', { class: 'ob-basis-row' + (r.k === '잔여' ? ' sum' : '') }, el('dt', {}, 단추), el('dd', {}, r.v), 칸);
  }));
}

// 할 일 하나가 무엇을 내보낼지.
export function 할일미리보기(t) {
  const p = t.preview ?? {};
  let 몸 = null;
  if (t.id === 'roster-date' && p.text) 몸 = kv('적을 값', p.text);
  else if ((t.id === 'hub-cal' || t.id === 'google-cal') && p.일정?.length) 몸 = el('div', {}, p.일정.map((x) => kv(x.date, x.title)));
  else if (t.id === 'channel' && p.text) 몸 = bubble(p.text, { slack: true });
  else if (t.id === 'dm' && p.text) 몸 = el('div', {}, kv('문안', 문안이름[p.kind] ?? ''), bubble(p.text, { slack: true }));
  return 몸 ? el('details', { class: 'ht-pv' }, el('summary', {}, '미리보기'), 몸) : null;
}

// plan: 계획만들기 의 답. 고름: { on:Set, off:Set, past:{} } — 담당자가 손으로 켜고 끈 것만 기억해 미리보기를 다시 받아도 이어 간다.
// 돌려줌: { node, 고른것() → { tasks, past }, 확인줄() → [글] }
export function 계획칸(plan, rec, 고름 = {}) {
  const tasks = plan.지금할일 ?? [];
  고름.on ??= new Set();
  고름.off ??= new Set();
  고름.past ??= {};
  const picked = 고른할일(tasks, 고름);
  const rows = 시간표(plan.그날할일, rec);

  const 지금줄 = tasks.map((t) => {
    const box = el('input', { type: 'checkbox', 'aria-label': t.label, checked: picked.has(t.id), disabled: Boolean(t.done || t.blocked) });
    const li = el('li', { class: 'ht-task' + (t.blocked ? ' blocked' : '') + (!box.checked && !t.blocked ? ' off' : '') },
      el('label', { class: 'ht-line' }, box, el('span', { class: 'ht-name' }, t.label), t.where ? el('span', { class: 'ht-where' }, t.where) : null),
      t.blocked ? el('p', { class: 'ht-why' }, 문장나누기(t.blocked)) : 할일미리보기(t));
    box.addEventListener('change', () => {
      if (box.checked) { picked.add(t.id); 고름.on.add(t.id); 고름.off.delete(t.id); } else { picked.delete(t.id); 고름.off.add(t.id); 고름.on.delete(t.id); }
      li.classList.toggle('off', !box.checked);
    });
    return li;
  });

  // 그날 할 일. 날짜가 지난 줄만 고른다 — 안 지난 것은 그날 저절로 한다.
  const 그날줄 = rows.map((r) => {
    const 지금값 = () => 고름.past[r.id] ?? r.기본;
    const 고르기 = r.고를까 ? (() => {
      const 단추 = [지금하기, 이미함].map((v) => el('button', {
        type: 'button', class: 'seg-btn', 'aria-pressed': String(지금값() === v),
        onclick: () => { 고름.past[r.id] = v; for (const b of 단추) b.setAttribute('aria-pressed', String(b.textContent === v)); },
      }, v));
      return el('div', { class: 'seg', role: 'group', 'aria-label': `${r.label} — 지금 하기 또는 이미 함` }, 단추);
    })() : null;
    return el('li', { class: 'ob-slot' + (r.지남 ? ' past' : '') },
      el('div', { class: 'ob-slot-when' }, el('span', { class: 'ob-slot-head' }, r.머리), el('span', { class: 'ob-slot-day' }, r.날 || '—')),
      el('div', { class: 'ob-slot-what' },
        el('span', { class: 'ob-slot-label' }, r.label),
        r.blocked ? el('span', { class: 'ob-slot-note bad' }, r.blocked)
          : r.지남 ? el('span', { class: 'ob-slot-note' }, '날짜가 이미 지났습니다.\n지금 할지, 이미 했는지 골라 주세요.') : null),
      고르기);
  });

  const node = el('div', { class: 'ob-plan' },
    el('div', { class: 'ht-head' }, el('h4', { class: 'ob-plan-title' }, '지금 할 일'), el('span', { class: 'ht-sub' }, '고른 일만 [등록하고 실행] 을 누를 때 합니다.')),
    el('ul', { class: 'ht-list' }, 지금줄),
    el('div', { class: 'ht-head', style: 'margin-top:16px' }, el('h4', { class: 'ob-plan-title' }, '그날 할 일'), el('span', { class: 'ht-sub' }, '등록하면 예약해 두고, 그 시각이 지난 뒤 이 앱이 열려 있으면 저절로 합니다.')),
    el('ul', { class: 'ob-slots' }, 그날줄),
    알림칸(plan.알림));

  return {
    node,
    고른것: () => ({ tasks: tasks.filter((t) => picked.has(t.id)).map((t) => t.id), past: 지난것고름(rows, 고름.past) }),
    확인줄: () => 확인줄들(tasks, picked, rows, 고름.past),
  };
}

// 결과 { 대상: { status, 말 } } → 줄 목록.
export function 결과목록(results) {
  const r = 결과줄들(results);
  if (!r.줄.length) return null;
  return el('ul', { class: 'ob-results' }, r.줄.map((x) => el('li', { class: x.꼴 },
    el('span', { class: 'dot' }), el('span', { class: 'ob-result-name' }, `${x.이름} · ${x.상태}`), el('span', { class: 'ob-result-msg' }, 문장나누기(x.말)))));
}

// 그날 할 일 칸(slot)의 상태 줄.
export function 그날결과(slots) {
  const 줄 = Object.entries(slots ?? {});
  if (!줄.length) return null;
  return el('ul', { class: 'ob-results' }, 줄.map(([id, s]) => {
    const st = 상태보기(s.status);
    return el('li', { class: st.꼴 }, el('span', { class: 'dot' }), el('span', { class: 'ob-result-name' }, `${짧은이름[id]} · ${st.말}`),
      el('span', { class: 'ob-result-msg' }, s.status === 'waiting' ? `${s.때} 예약` : 문장나누기(s.note || '')));
  }));
}

// 조직도 그림 그리기. 조직도(orgview.js)와 TO표(toview.js)가 나눠 쓴다 — 베껴 쓰면 둘이 갈라진다.
// 상태를 들고 있지 않는다. 자리 계산은 orgchart.js 의 layout() 이 하고, 모양은 style.css 의 .oc-* 가 잡는다.
import { el } from './dom.js';
import { gridCol, gridRow, isDual, 상자글 } from './orgchart.js';

// 깊이별 음영. 전사 통합은 한 층이 더 깊어지므로 여섯 단계.
export const shade = (row) => `oc-u${Math.min(row, 5)}`;
// 화면 한 장보다 긴 막대는 이름표가 스크롤을 따라온다.
const 따라오는칸 = 10;

// 상자 하나. 수: 상자 안 오른쪽 위에 적을 인원수. tip: title 에 덧붙일 글. cls: 덧붙일 class.
export function 상자(p, { tip = '', cls = '', 수 = '', found = false } = {}) {
  const node = p.node;
  const 사람 = p.kind === 'person';
  const 겸 = isDual(node);
  const 아래글 = 상자글(node);
  const 셀수 = 수 === 0 || 수 === '' || 수 === null || 수 === undefined ? '' : String(수);
  const classes = ['oc-box', 사람 ? 'oc-p' : shade(p.row), p.span >= 따라오는칸 ? 'oc-wide' : '',
    겸 ? 'oc-dual' : '', cls, 셀수 ? 'oc-has-n' : '', found ? 'oc-found' : ''].filter(Boolean).join(' ');
  return el('div', {
    class: classes,
    style: `grid-column:${gridCol(p)};grid-row:${gridRow(p)}`,
    'data-id': node.id || null,
    tabindex: '0',
    title: [[node.name, 아래글 ? `(${아래글})` : ''].filter(Boolean).join(' '), 겸 ? '겸직(인원수에 세지 않습니다)' : '', tip].filter(Boolean).join(' — '),
  },
  el('span', { class: 'oc-text' },
    셀수 ? el('span', { class: 'oc-n' }, 셀수) : null,
    el('span', { class: 'oc-name' }, node.name),
    아래글 ? el('span', { class: 'oc-role' }, `(${아래글})`) : null),
  겸 ? el('span', { class: 'oc-dual-tag' }, '겸직') : null);
}

// 격자. 줄 사이 틈은 어디서나 같다(7px). 더할줄: 편집 모드의 [＋] 단추가 설 줄들.
export function 격자({ cols, rows }, { zoom = 1, 더할줄 = [] } = {}) {
  const 줄수 = Math.max(rows, ...더할줄.map((a) => a.row + 1), 0);
  const 틈 = Array.from({ length: 줄수 }, () => '7px auto').join(' ');
  return el('div', { class: 'oc', style: `grid-template-columns:repeat(${cols}, var(--col));grid-template-rows:${틈};zoom:${zoom}` });
}

// 전사 통합에서 맨 위 조직을 가르는 금. 띄워 둔 빈 칸 가운데에 선다.
export function 가름선(col) {
  return el('div', { class: 'oc-split', style: `grid-column:${col} / span 1;grid-row:1 / -1`, 'aria-hidden': 'true' });
}

// 빈 곳을 잡고 밀어 다닌다. 단추·입력칸에서 누른 것은 밀기가 아니고, 실제로 민 뒤의 누름은 버린다.
export function 잡고밀기(scroll) {
  let from = null;
  let 밀었나 = false;
  scroll.addEventListener('pointerdown', (e) => {
    밀었나 = false;
    if (e.button !== 0) return;
    if (e.target.closest('button, a, input, select, textarea')) return;
    from = { x: e.clientX, y: e.clientY, left: scroll.scrollLeft, top: window.scrollY };
    scroll.classList.add('oc-panning');
  });
  scroll.addEventListener('pointermove', (e) => {
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (!밀었나 && Math.hypot(dx, dy) < 5) return;
    밀었나 = true;
    e.preventDefault();
    scroll.scrollLeft = from.left - dx;
    window.scrollTo(0, from.top - dy);
  });
  const 놓음 = () => { from = null; scroll.classList.remove('oc-panning'); };
  scroll.addEventListener('pointerup', 놓음);
  scroll.addEventListener('pointercancel', 놓음);
  scroll.addEventListener('pointerleave', 놓음);
  scroll.addEventListener('click', (e) => {
    if (!밀었나) return;
    밀었나 = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}

// 찾기 칸. 칠 때는 그림만 다시 그린다(판 전체를 갈면 칸이 새로 생겨 한글 조합이 깨진다).
export function 찾기칸({ placeholder, value, onChange }) {
  const box = el('input', { type: 'search', class: 'org-search', placeholder, 'aria-label': placeholder, autocomplete: 'off' });
  box.value = value;
  let timer = 0;
  box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => onChange(box.value), 120); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); clearTimeout(timer); onChange(box.value); } });
  return box;
}

// 찾은 첫 상자가 보이게 통을 민다.
export function 찾은데로(scroll) {
  const box = scroll.querySelector('.oc-box.oc-found');
  if (!box) return;
  const 넘침 = scroll.scrollWidth - scroll.clientWidth;
  if (넘침 <= 0) return;
  const 통 = scroll.getBoundingClientRect();
  const 것 = box.getBoundingClientRect();
  const left = scroll.scrollLeft + (것.left - 통.left) - (통.width - 것.width) / 2;
  scroll.scrollTo({ left: Math.max(0, Math.min(left, 넘침)), behavior: 'instant' });
}

// 탭 줄(전사 통합 + 맨 위 조직). count(id) 는 탭에 적을 숫자 글을 돌려준다.
export function 탭줄({ tops, tab, label, onPick, extra = null }) {
  const 칸 = (id, name) => el('button', {
    type: 'button', class: `org-tab${tab === id ? ' on' : ''}`, role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', onclick: () => onPick(id),
  }, el('span', { class: 'org-tab-name' }, name), label(id), extra?.(id));
  return el('div', { class: 'org-tabs', role: 'tablist' }, 칸('__all__', '전사 통합'), tops.map((r) => 칸(r.id, r.name)));
}

export const ZOOMS = [1.2, 1, 0.85, 0.7, 0.55];
export function 줌단추(zoom, onChange) {
  const at = ZOOMS.indexOf(zoom);
  const go = (step) => onChange(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + step))]);
  return el('div', { class: 'org-zoom', role: 'group', 'aria-label': '크기' },
    el('button', { type: 'button', class: 'btn ghost', 'aria-label': '작게', disabled: at === ZOOMS.length - 1, onclick: () => go(1) }, '－'),
    el('span', { class: 'org-zoom-n' }, `${Math.round(zoom * 100)}%`),
    el('button', { type: 'button', class: 'btn ghost', 'aria-label': '크게', disabled: at === 0, onclick: () => go(-1) }, '＋'));
}

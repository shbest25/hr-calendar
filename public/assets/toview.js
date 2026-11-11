// TO표 화면(#/to). 조직도와 똑같이 생기고 TO 기능만 얹힌다 — 빈자리(TO)를 사람 상자 모양의 가짜 사람으로
// 나무에 끼워 넣고 조직도와 같은 자리 계산(orgchart.js)·그리기(orgpaint.js)를 돌린다.
//
// 보기는 둘: 그림(조직도 모양)과 요약(층별 숫자 표). 숫자는 다섯 가지뿐이다 — 최종·현·채용 중·입사 예정·잔여.
// TO 를 만들거나 고치는 것은 [편집 모드] 안에서, 채용 시작·입사예정자 등록 같은 '진행' 은 평소에 상자를 눌러서.
// 바꾼 것은 전부 기록(log)에 남는다. 자료는 records 의 'to' 기록 하나(조직 나무는 'org' 기록을 같이 읽는다).
import { el, replace } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, toast, field, selectBox, openDrawer } from './ui.js';
import { loadDoc, saveDoc } from './docs.js';
import { hashOf, hashQuery } from './route.js';
import { stamp } from './autotext.js';
import {
  ORG_ID, TO_ID, ALL_CARD, treeOf, flatten, topUnits, allRootOf, pathOf, layout, isLegend,
  찾은것, 세기, 요약, 합계, 빈셈, 숫자들, 자리글, 자리색, 자리끼운나무, 진행이름, 사유이름, 기록글,
} from './orgchart.js';
import { 상자, 격자, 가름선, 잡고밀기, 찾기칸, 찾은데로, 탭줄, 줌단추 } from './orgpaint.js';

const EMPTY_ORG = { rows: [], history: [] };
const EMPTY_TO = { seats: [], log: [] };
const state = { tab: ALL_CARD, zoom: 1, 보기: 'chart', 부서: '', 깊이: 99, q: '', edit: false };
const 깊이들 = [[1, '맨 위 조직까지'], [2, '본부·실까지'], [3, '팀까지'], [99, '파트까지 전부']];
const 범례들 = [['to-s-left', '결원 TO', '퇴직예정자가 비운 TO'], ['to-s-hiring', '채용 중 TO', '공고를 올린 TO'], ['to-s-incoming', '입사 예정 TO', '들어올 사람이 정해진 TO'], ['to-s-new', '신규 TO', '새로 늘린 TO']];
const 종류들 = [['new', '신규 TO', '새로 늘린 TO'], ['left', '결원 TO', '누가 나가서 빈 TO'], ['hiring', '채용 중 TO', '공고를 이미 올린 TO'], ['incoming', '입사 예정 TO', '들어올 사람이 정해진 TO']];
const newId = () => 'seat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function renderTo(root, ctx) {
  root.replaceChildren(el('p', { class: 'lead-muted' }, '불러오는 중'));
  let org; let doc; let hires = [];
  try {
    org = await loadDoc(ctx.store, 'org', ORG_ID, EMPTY_ORG);
    doc = await loadDoc(ctx.store, 'to', TO_ID, EMPTY_TO);
  } catch (e) {
    root.replaceChildren(el('div', { class: 'card sec-empty' }, icon('lock'), el('p', {}, ctx.canEdit ? e.message : 'TO표에는 퇴사 예정과 채용 중인 자리가 적혀 있어 관리자가 로그인해야 보입니다.')));
    return;
  }
  try { hires = (await ctx.store.records('hire')).filter((r) => r.data.stage !== 'done'); } catch { hires = []; }
  const wanted = hashQuery(location.hash).get('tab');
  if (wanted) state.tab = wanted;
  if (!ctx.canEdit) state.edit = false;
  let settings = null;
  try { settings = await ctx.settings(); } catch { settings = null; }
  const 회사 = settings?.company?.short || '전사';

  const tree = treeOf(org.rows);
  const flat = flatten(tree);
  const byId = new Map(flat.map((n) => [String(n.id), n]));
  const tops = topUnits(tree);
  if (state.tab !== ALL_CARD && !tops.some((r) => r.id === state.tab)) state.tab = ALL_CARD;
  // 입사 예정 TO 의 이름·날짜는 입사자 기록에서 바로 읽는다(그쪽에서 고쳐도 따라온다).
  const hireOf = (id) => hires.find((h) => h.id === id)?.data;
  const 자리들 = () => doc.seats.map((s) => {
    const h = s.hire_id ? hireOf(s.hire_id) : null;
    return h ? { ...s, join_name: h.name, join_at: h.start_date } : s;
  });
  let seats = 자리들();
  let counts = 세기(tree, seats);
  const 셈 = (id) => counts.get(String(id)) ?? 빈셈;
  const 그칸자리 = (id) => seats.filter((s) => String(s.unit_id) === String(id));
  const 제현 = (id) => 셈(id).현 - flat.filter((n) => n.kind === 'unit' && String(n.parent_id ?? '') === String(id)).reduce((a, k) => a + 셈(k.id).현, 0);

  function 기록(kind, s, extra = {}) {
    doc.log = [{ at: new Date().toISOString(), by: ctx.me.name, unit_id: s.unit_id, kind, before: extra.before ?? null, after: extra.after ?? { reason: s.reason, step: s.step }, note: extra.note ?? '' }, ...(doc.log ?? [])].slice(0, 300);
  }
  async function save(말) {
    try {
      await saveDoc(ctx.store, 'to', TO_ID, doc);
      seats = 자리들();
      counts = 세기(tree, seats);
      draw();
      if (말) toast(말);
    } catch (e) { toast(e.message, { error: true }); }
  }

  // ── 범위 ──
  const 뿌리고르기 = (나무들) => {
    if (state.부서) {
      const got = flatten(나무들).find((n) => n.id === state.부서);
      if (got) return got;
    }
    return state.tab === ALL_CARD ? allRootOf(나무들, 회사) : 나무들.find((r) => r.id === state.tab);
  };
  const 이범위 = () => (state.부서 ? 셈(state.부서) : state.tab !== ALL_CARD ? 셈(state.tab) : 합계(tops.map((r) => ({ depth: 0, c: 셈(r.id) }))));

  function 범례() {
    return el('div', { class: 'to-keys' },
      범례들.map(([c, 름, 뜻]) => el('span', { class: `to-key ${c}`, title: 뜻 }, 름, el('i', {}, 뜻))),
      el('span', { class: 'to-note' }, state.edit
        ? '편집 모드입니다. 조직 칸 아래 [＋ TO] 로 TO 를 만들고, TO 를 누르면 고치거나 다른 칸으로 옮깁니다. 누르는 즉시 기록에 남습니다.'
        : '상자를 누르면 그 TO 의 채용을 다룹니다. TO 를 만들거나 고치려면 [편집 모드] 를 켜세요.'));
  }

  function 통계줄() {
    const c = 이범위();
    const 어디 = state.부서 ? (byId.get(state.부서)?.name ?? '') : (state.tab === ALL_CARD ? '전사 통합' : (byId.get(state.tab)?.name ?? ''));
    return el('div', { class: 'to-stats' },
      el('div', { class: 'to-stat-where' }, el('b', {}, 어디), el('span', {}, state.부서 ? '부서로 걸렀습니다' : 'TO 현황')),
      숫자들.map(([름, 키, 뜻]) => el('div', { class: `to-stat to-stat-${키}`, title: 뜻 }, el('b', {}, String(c[키] ?? 0)), el('span', {}, 름))));
  }

  // ── 그림 ──
  function chartOf(top) {
    const 통합 = top.tag === 'virtual';
    const 판 = layout(top, { split: 통합 });
    const 찾은 = 찾은것(통합 ? top.children : [top], state.q);
    const 더할것 = state.edit ? 판.nodes.filter((p) => p.kind === 'unit' && p.node.id && !(p.node.children ?? []).some((c) => c.kind === 'unit'))
      .map((p) => ({ node: p.node, col: p.col, row: p.row + 1 + (p.node.children ?? []).filter((c) => c.kind === 'person').length })) : [];
    const grid = 격자(판, { zoom: state.zoom, 더할줄: 더할것 });
    const parts = 판.nodes.map((p) => {
      const s = p.node.seat;
      return 상자(p, {
        수: p.kind === 'unit' ? 셈(p.node.id).현 : '',
        found: Boolean(찾은?.has(p.node.id)),
        cls: [s ? `to-seat-box ${자리색(s)}` : '', p.node.id ? 'oc-click' : ''].filter(Boolean).join(' '),
        tip: s
          ? [`${사유이름[s.reason]} · ${진행이름[s.step]}`, s.left_name ? `${s.left_name} 결원${s.left_at ? ` (${s.left_at})` : ''}` : '', s.job ? `직무 ${s.job}` : '', s.note].filter(Boolean).join(' — ') + ` — 눌러서 ${state.edit ? '고치기' : '다루기'}`
          : (p.kind === 'unit' && p.node.id ? '눌러서 이 칸의 숫자 보기' : ''),
      });
    });
    if (통합) {
      const 뿌리들 = 판.nodes.filter((p) => p.kind === 'unit' && tops.some((r) => r.id === p.node.id)).sort((a, b) => a.col - b.col);
      for (const p of 뿌리들.slice(1)) parts.push(가름선(p.col));
    }
    for (const a of 더할것) {
      parts.push(el('button', { type: 'button', class: 'oc-add', style: `grid-column:${a.col + 1} / span 1;grid-row:${a.row * 2 + 2}`, title: `${a.node.name} 에 TO 추가`, onclick: (e) => { e.stopPropagation(); TO추가서랍(a.node.id); } }, '＋ TO'));
    }
    replace(grid, parts);
    const 통 = el('div', { class: `oc-scroll to-scroll${state.edit ? ' to-editing' : ''}`, tabindex: '0' }, grid);
    잡고밀기(통);
    통.addEventListener('click', (e) => {
      const box = e.target.closest('.oc-box[data-id]');
      const id = box?.dataset.id;
      if (!id) return;
      if (id.startsWith('seat:')) { 자리서랍(id.slice(5)); return; }
      const node = byId.get(id);
      if (node?.kind === 'unit' && !isLegend(node)) 칸서랍(id);
    });
    const 표 = 찾은 ? el('p', { class: 'org-found' }, 찾은.size ? el('b', {}, `${찾은.size}건 짚었습니다`) : el('i', {}, '찾은 것이 없습니다')) : null;
    if (찾은?.size) setTimeout(() => 찾은데로(통), 0);
    return [표, el('section', { class: 'oc-chart' }, 통)];
  }

  // ── 요약 표 ──
  const 숫자칸 = (c, 키) => {
    const n = Number(c[키] ?? 0);
    return el('td', { class: `to-t-n${n === 0 ? ' to-t-zero' : 키 === '잔여' ? ' to-t-rest' : ''}` }, String(n));
  };
  function 요약표(top) {
    const rows = 요약(top, counts, { 깊이: state.깊이 });
    if (!rows.length) return el('p', { class: 'org-empty' }, '볼 칸이 없습니다.');
    const 합 = 합계(rows);
    return el('section', { class: 'to-sum-view' },
      el('div', { class: 'to-table-wrap' },
        el('table', { class: 'to-table' },
          el('thead', {}, el('tr', {},
            el('th', { class: 'to-t-name', scope: 'col' }, '조직'),
            숫자들.map(([름, 키, 뜻]) => el('th', { class: `to-t-n to-t-${키}`, scope: 'col', title: 뜻 }, 름)),
            el('th', { class: 'to-t-act', scope: 'col' }, '기록'))),
          el('tbody', {},
            rows.map((r) => el('tr', { class: `to-t-d${Math.min(r.depth, 4)}` },
              el('th', { class: 'to-t-name', scope: 'row' }, el('span', { style: `padding-left:${r.depth * 14}px` }, r.name)),
              숫자들.map(([, 키]) => 숫자칸(r.c, 키)),
              el('td', { class: 'to-t-act' }, el('button', { type: 'button', class: 'to-t-log', title: `${r.name} 의 기록`, 'aria-label': `${r.name} 의 기록`, onclick: () => 로그서랍(r.id) }, icon('doc'))))),
            el('tr', { class: 'to-t-sum' }, el('th', { class: 'to-t-name', scope: 'row' }, '합계'), 숫자들.map(([, 키]) => 숫자칸(합, 키)), el('td', { class: 'to-t-act' }))))),
      el('p', { class: 'to-t-foot' }, '위층 수는 밑에 딸린 칸을 모두 품은 수입니다. 합계는 맨 윗줄만 더한 것이라 두 번 세지 않습니다. 최종 TO = 현 TO + 잔여 TO + 입사 예정 TO, 잔여 TO = 채용 중 + 결원 + 신규 입니다.'));
  }

  // ── 도구 ──
  function toolbar() {
    const 칸들 = flat.filter((n) => n.kind === 'unit' && n.id && !isLegend(n)).map((n) => [n.id, pathOf(n.id, byId)]).sort((a, b) => a[1].localeCompare(b[1], 'ko'));
    const 부서 = selectBox('부서', [['', '부서 전체'], ...칸들], state.부서, { class: 'to-dept' });
    부서.addEventListener('change', () => { state.부서 = 부서.value; draw(); });
    const 깊이 = selectBox('몇 층까지 볼지', 깊이들, state.깊이);
    깊이.addEventListener('change', () => { state.깊이 = Number(깊이.value); draw(); });
    const 보기 = (값, 름, 그림) => el('button', { type: 'button', class: `to-view-one${state.보기 === 값 ? ' on' : ''}`, 'aria-pressed': state.보기 === 값 ? 'true' : 'false', onclick: () => { if (state.보기 !== 값) { state.보기 = 값; draw(); } } }, icon(그림), 름);
    return el('div', { class: 'org-bar' },
      부서,
      state.보기 === 'chart' ? 찾기칸({ placeholder: '이름·팀·직무로 찾기', value: state.q, onChange: (q) => { state.q = q; 그림만다시(); } }) : null,
      el('div', { class: 'to-view', role: 'group', 'aria-label': '어떻게 볼지' }, 보기('chart', '그림', 'sitemap'), 보기('sum', '요약', 'table')),
      state.보기 === 'chart' ? 줌단추(state.zoom, (z) => { state.zoom = z; draw(); }) : 깊이,
      el('button', { type: 'button', class: 'btn ghost', onclick: () => 로그서랍('') }, icon('doc'), '전체 기록'),
      el('a', { class: 'btn ghost', href: hashOf('org') }, icon('sitemap'), '조직도'),
      ctx.canEdit ? el('button', { type: 'button', class: `btn ${state.edit ? 'primary' : 'ghost'}`, 'aria-pressed': state.edit ? 'true' : 'false', title: 'TO 를 손으로 만들고 고칩니다', onclick: () => { state.edit = !state.edit; draw(); } }, icon('edit'), state.edit ? '편집 모드 끄기' : '편집 모드') : null);
  }

  let 그림자리 = null;
  function 그림만다시() {
    if (!그림자리 || state.보기 !== 'chart') { draw(); return; }
    const x = 그림자리.querySelector('.oc-scroll')?.scrollLeft ?? 0;
    const top = 뿌리고르기(tree.map((r) => 자리끼운나무(r, 그칸자리)));
    replace(그림자리, top ? chartOf(top) : null);
    const 새통 = 그림자리.querySelector('.oc-scroll');
    if (새통 && !state.q) 새통.scrollLeft = x;
  }

  function draw() {
    const 밑그림 = tree.map((r) => 자리끼운나무(r, 그칸자리));
    const top = 뿌리고르기(밑그림);
    const 요약뿌리 = 뿌리고르기(tree);
    그림자리 = el('div', { class: 'org-chart-slot' }, !top ? el('p', { class: 'org-empty' }, '조직도가 아직 비어 있습니다. 먼저 [조직도] 에서 조직을 만들어 주세요.')
      : state.보기 === 'sum' ? 요약표(요약뿌리) : chartOf(top));
    replace(root, 범례(), tree.length ? 통계줄() : null,
      탭줄({
        tops, tab: state.tab,
        label: (id) => { const c = id === ALL_CARD ? 합계(tops.map((r) => ({ depth: 0, c: 셈(r.id) }))) : 셈(id); return el('span', { class: 'org-tab-n' }, String(c.현), el('i', {}, c.최종 > c.현 ? `명 / 최종 ${c.최종}` : '명')); },
        extra: (id) => { const c = id === ALL_CARD ? 합계(tops.map((r) => ({ depth: 0, c: 셈(r.id) }))) : 셈(id); return c.잔여 ? el('span', { class: 'to-tab-rest' }, `잔여 ${c.잔여}`) : null; },
        onPick: (id) => { state.tab = id; state.부서 = ''; draw(); },
      }),
      toolbar(), 그림자리);
  }

  // ── 조직 칸 하나 ──
  function 칸서랍(unitId) {
    const node = byId.get(unitId);
    if (!node) return;
    const c = 셈(unitId);
    const 직속 = 제현(unitId);
    openDrawer({
      title: node.name, lead: chip(icon('users')),
      body: el('div', {},
        el('div', { class: 'to-sum' }, 숫자들.map(([름, 키, 뜻]) => el('div', { class: 'to-sum-one', title: 뜻 }, el('b', {}, String(c[키] ?? 0)), el('span', {}, 름.replace(' TO', ''))))),
        el('p', { class: 'lead-muted', style: 'margin:12px 0' }, `이 칸에 직접 속한 사람 ${직속}명${c.현 - 직속 ? ` · 밑에 딸린 사람 ${c.현 - 직속}명` : ''}`),
        그칸자리(unitId).length ? el('ul', { class: 'home-list' }, 그칸자리(unitId).map((s) => el('li', {}, el('span', { class: `to-key ${자리색(s)}` }, 자리글(s).name), el('small', {}, 자리글(s).role || '')))) : null,
        el('div', { class: 'org-acts' },
          state.edit ? el('button', { type: 'button', class: 'btn dark sm', onclick: () => TO추가서랍(unitId) }, icon('plus'), 'TO 추가') : null,
          el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 로그서랍(unitId) }, icon('doc'), '이 칸의 기록')),
        state.edit ? null : el('p', { class: 'to-t-foot' }, 'TO 를 만들려면 [편집 모드] 를 켜세요.')),
    });
  }

  const 입사자고르기 = (unitId) => {
    const 줄세움 = [...hires].sort((a, b) => Number(b.data.team && byId.get(unitId)?.name?.includes(b.data.team)) - Number(a.data.team && byId.get(unitId)?.name?.includes(a.data.team)));
    return selectBox('붙일 입사자', 줄세움.map((h) => [h.id, `${h.data.name} (${[h.data.start_date || '입사일 없음', h.data.dept, h.data.job].filter(Boolean).join(' · ')})`]), 줄세움[0]?.id ?? '');
  };

  // ── TO 추가(편집 모드) ──
  function TO추가서랍(unitId) {
    const 칸 = byId.get(unitId);
    if (!칸) return;
    const 종류 = selectBox('만들 TO 종류', 종류들.map(([v, 름, 뜻]) => [v, `${름} — ${뜻}`]), 'new');
    const 직무 = el('input', { type: 'text', placeholder: '예: 서버 개발자' });
    const 이름 = el('input', { type: 'text', placeholder: '누구의 결원' });
    const 날 = el('input', { type: 'date' });
    const 메모 = el('input', { type: 'text', maxlength: '200', placeholder: '기록에 남길 한 줄(마음대로)' });
    const 입사자 = hires.length ? 입사자고르기(unitId) : null;
    const 직무칸 = field('직무명', 직무, '채용 중 TO 는 꼭 적어야 합니다. 나중에 고칠 수 있습니다.');
    const 결원칸 = el('div', {}, field('누구의 결원', 이름), field('퇴사일', 날));
    const 입사칸 = 입사자 ? field('붙일 입사자', 입사자, '[신규 입사자] 에 적어 둔 사람 중에서 고릅니다.') : el('p', { class: 'lead-muted' }, '붙일 수 있는 입사자가 없습니다. 먼저 [신규 입사자] 에서 등록하세요.');
    const 보이기 = () => { 직무칸.hidden = 종류.value === 'incoming'; 결원칸.hidden = 종류.value !== 'left'; 입사칸.hidden = 종류.value !== 'incoming'; };
    보이기();
    종류.addEventListener('change', 보이기);
    const ctl = openDrawer({
      title: `${칸.name} 에 TO 추가`, lead: chip(icon('plus')),
      body: el('div', {}, el('p', { class: 'lead-muted', style: 'margin-bottom:12px' }, `${칸.name} 에 TO 를 하나 만듭니다. 이 칸의 최종 TO 가 하나 늘어납니다.`),
        field('무엇을 만들까요', 종류), 직무칸, 결원칸, 입사칸, field('메모', 메모)),
      footer: el('button', { type: 'button', class: 'btn primary', onclick: () => {
        const 고른것 = 종류.value;
        if (고른것 === 'hiring' && !직무.value.trim()) { toast('직무명을 적어 주세요', { error: true }); return; }
        if (고른것 === 'incoming' && !입사자?.value) { toast('붙일 수 있는 입사자가 없습니다', { error: true }); return; }
        const s = {
          id: newId(), unit_id: unitId, reason: 고른것 === 'left' ? 'left' : 'new', step: 고른것 === 'hiring' ? 'hiring' : 고른것 === 'incoming' ? 'incoming' : 'idle',
          job: 고른것 === 'incoming' ? (hireOf(입사자.value)?.job ?? '') : 직무.value.trim(), left_name: 고른것 === 'left' ? 이름.value.trim() : '', left_at: 고른것 === 'left' ? 날.value : '',
          hiring_at: 고른것 === 'hiring' ? new Date().toISOString().slice(0, 10) : '', hire_id: 고른것 === 'incoming' ? 입사자.value : '', join_name: '', join_at: '',
          note: 메모.value.trim(), updated_at: new Date().toISOString(), updated_by: ctx.me.name,
        };
        doc.seats.push(s);
        기록('seat-add', s, { note: [s.job, s.left_name ? `${s.left_name} 결원` : '', s.note].filter(Boolean).join(' · ') });
        ctl.close();
        save('TO 를 만들었습니다');
      } }, '만들기'),
    });
  }

  // ── 빈자리 하나 ──
  function 자리서랍(seatId) {
    const s = doc.seats.find((x) => x.id === seatId);
    if (!s) return;
    const 보임 = seats.find((x) => x.id === seatId) ?? s;
    const 칸 = byId.get(s.unit_id);
    const 딸림 = [s.left_name ? `${s.left_name} 결원${s.left_at ? ` (${s.left_at})` : ''}` : '', s.job ? `직무 ${s.job}` : '', 보임.join_name ? `${보임.join_name} · ${보임.join_at || ''} 입사 예정` : '', s.note || ''].filter(Boolean);
    const 머리 = el('p', { class: 'lead-muted', style: 'margin-bottom:12px' }, `${사유이름[s.reason]} · ${진행이름[s.step]}` + (딸림.length ? ` — ${딸림.join(' · ')}` : ''));
    const 기록단추 = el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 로그서랍(s.unit_id) }, icon('doc'), '이 칸의 기록');
    if (state.edit) { 자리고치기(s, 칸, 머리, 기록단추); return; }
    const 막힘 = !ctx.canEdit;
    const close = () => ctl.close();
    const ctl = openDrawer({
      title: `${자리글(보임).name} — ${칸?.name ?? ''}`, lead: chip(icon('user-add')),
      body: el('div', {}, 머리,
        막힘 ? el('p', { class: 'lead-muted' }, '로그인한 관리자만 바꿀 수 있습니다.') : el('div', { class: 'org-acts' },
          s.step === 'idle' ? el('button', { type: 'button', class: 'btn primary sm', onclick: () => 채용시작(s, close) }, '채용 시작') : null,
          s.step === 'hiring' ? el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 채용멈춤(s, close) }, '채용 멈춤') : null,
          s.step !== 'incoming'
            ? el('button', { type: 'button', class: 'btn dark sm', onclick: () => 사람붙이기(s, close) }, '입사예정자 등록')
            : el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 사람떼기(s, close) }, '입사예정자 지우기')),
        el('p', { class: 'to-t-foot' }, '사유·직무명·퇴사일을 손으로 고치거나 이 TO 를 옮기고 지우려면 [편집 모드] 를 켜세요.'),
        el('div', { class: 'org-acts' }, 기록단추)),
    });
  }

  function 자리고치기(s, 칸, 머리, 기록단추) {
    const 사유 = selectBox('이 TO 가 빈 사유', [['new', '신규 — 새로 늘린 TO'], ['left', '결원 — 누가 나가서 빈 TO']], s.reason);
    const 직무 = el('input', { type: 'text', value: s.job || '' });
    const 이름 = el('input', { type: 'text', value: s.left_name || '' });
    const 날 = el('input', { type: 'date', value: s.left_at || '' });
    const 메모 = el('input', { type: 'text', value: s.note || '', maxlength: '200' });
    const 입사예정 = s.step === 'incoming';
    const 진행 = selectBox('채용 진행', [['idle', '채용 전'], ['hiring', '채용 중 — 공고를 올림']], s.step);
    const 어디 = selectBox('어느 칸', flat.filter((n) => n.kind === 'unit' && n.id && !isLegend(n)).map((n) => [n.id, pathOf(n.id, byId)]), s.unit_id);
    const 결원칸 = el('div', {}, field('누구의 결원', 이름), field('퇴사일', 날));
    const 결원보이기 = () => { 결원칸.hidden = 사유.value !== 'left'; };
    결원보이기();
    사유.addEventListener('change', 결원보이기);
    const ctl = openDrawer({
      title: `${자리글(s).name} 고치기 — ${칸?.name ?? ''}`, lead: chip(icon('edit')),
      body: el('div', {}, 머리,
        field('사유', 사유, '신규로 되돌리면 결원 정보는 함께 지웁니다.'),
        입사예정 ? null : field('채용', 진행, '채용 중으로 바꾸려면 직무명을 적어 주세요.'),
        field('직무명', 직무), 결원칸,
        field('어느 칸의 TO 인가', 어디, '다른 칸을 고르면 그쪽으로 옮깁니다(끌어서 옮기기 대신).'),
        field('메모', 메모),
        el('div', { class: 'org-acts' },
          el('button', { type: 'button', class: 'btn danger sm', onclick: async () => {
            if (!await confirmBox({ title: `${자리글(s).name} 을(를) 삭제할까요?`, message: `${칸?.name ?? '이 칸'} 의 최종 TO 가 하나 줄어듭니다.`, confirm: '삭제', danger: true })) return;
            doc.seats = doc.seats.filter((x) => x.id !== s.id);
            기록('seat-drop', s, { before: { reason: s.reason, step: s.step }, after: null });
            ctl.close();
            save('TO 를 삭제했습니다');
          } }, icon('trash'), '삭제'),
          기록단추)),
      footer: el('button', { type: 'button', class: 'btn primary', onclick: () => {
        const step = 입사예정 ? s.step : 진행.value;
        if (step === 'hiring' && !직무.value.trim()) { toast('채용 중으로 바꾸려면 직무명을 적어 주세요', { error: true }); return; }
        const before = { reason: s.reason, step: s.step };
        const 옮김 = 어디.value !== s.unit_id;
        const 전칸 = 칸?.name ?? '';
        Object.assign(s, { reason: 사유.value, step, job: 직무.value.trim(), left_name: 사유.value === 'left' ? 이름.value.trim() : '', left_at: 사유.value === 'left' ? 날.value : '', note: 메모.value.trim(), unit_id: 어디.value, updated_at: new Date().toISOString(), updated_by: ctx.me.name });
        if (옮김) 기록('move', s, { before, note: `${전칸} → ${byId.get(s.unit_id)?.name ?? ''}` });
        else 기록(before.step !== step ? (step === 'hiring' ? 'hiring' : 'idle') : 'edit', s, { before, note: s.job });
        ctl.close();
        save(옮김 ? `${byId.get(s.unit_id)?.name ?? ''} 으로 옮겼습니다` : '이 TO 를 고쳤습니다');
      } }, '저장'),
    });
  }

  async function 채용시작(s, close) {
    const 직무 = el('input', { type: 'text', value: s.job || '', placeholder: '직무명' });
    const ok = await confirmBox({
      title: '이 TO 의 채용을 시작할까요?', message: '공고를 올린 시점에 누릅니다. 채용 중으로 표시되고 기록에 남습니다.' + (s.reason === 'left' && s.left_name ? ` ${s.left_name} 결원이라는 것은 그대로 남습니다.` : ''),
      confirm: '채용 시작', extra: field('직무명', 직무),
    });
    if (!ok) return;
    if (!직무.value.trim()) { toast('직무명을 적어 주세요', { error: true }); return; }
    const before = { reason: s.reason, step: s.step };
    Object.assign(s, { step: 'hiring', job: 직무.value.trim(), hiring_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(), updated_by: ctx.me.name });
    기록('hiring', s, { before, note: s.job });
    close?.();
    await save('채용 중으로 바꿨습니다');
  }
  async function 채용멈춤(s, close) {
    if (!await confirmBox({ title: '채용을 멈출까요?', message: 'TO 는 그대로 비어 있고 채용 중 표시만 내립니다. 직무명은 남겨 둡니다.', confirm: '채용 멈춤', danger: true })) return;
    const before = { reason: s.reason, step: s.step };
    Object.assign(s, { step: 'idle', updated_at: new Date().toISOString(), updated_by: ctx.me.name });
    기록('idle', s, { before });
    close?.();
    await save('채용을 멈췄습니다');
  }
  async function 사람붙이기(s, close) {
    if (!hires.length) { toast('붙일 수 있는 입사자가 없습니다. 먼저 [신규 입사자] 에서 등록하세요', { error: true }); return; }
    const 고르기 = 입사자고르기(s.unit_id);
    const ok = await confirmBox({ title: '이 TO 에 들어올 입사예정자를 정할까요?', message: '입사 예정 TO 로 바뀌고, 입사자 기록의 이름·입사일이 상자에 적힙니다.', confirm: '이 사람으로', extra: field('입사자', 고르기) });
    if (!ok) return;
    const before = { reason: s.reason, step: s.step };
    const h = hireOf(고르기.value);
    Object.assign(s, { step: 'incoming', hire_id: 고르기.value, job: s.job || h?.job || '', updated_at: new Date().toISOString(), updated_by: ctx.me.name });
    기록('incoming', s, { before, note: h ? `${h.name} · ${h.start_date || ''}` : '' });
    close?.();
    await save('입사 예정으로 붙였습니다');
  }
  async function 사람떼기(s, close) {
    const 보임 = seats.find((x) => x.id === s.id) ?? s;
    if (!await confirmBox({ title: `${보임.join_name || '이 사람'}을(를) 뗄까요?`, message: 'TO 는 다시 비어 있는 상태(채용 전)가 됩니다.', confirm: '떼기', danger: true })) return;
    const before = { reason: s.reason, step: s.step };
    Object.assign(s, { step: 'idle', hire_id: '', join_name: '', join_at: '', updated_at: new Date().toISOString(), updated_by: ctx.me.name });
    기록('detach', s, { before });
    close?.();
    await save('뗐습니다');
  }

  // ── 기록 ──
  function 로그서랍(unitId) {
    const rows = (doc.log ?? []).filter((r) => !unitId || r.unit_id === unitId);
    const 이름 = unitId ? (byId.get(unitId)?.name ?? '이 칸') : '전체';
    openDrawer({
      title: `${이름} 기록`, lead: chip(icon('doc')),
      body: rows.length
        ? el('div', { class: 'to-log' }, rows.map((r) => el('div', { class: 'to-log-one' },
          el('span', { class: 'to-log-at' }, stamp(r.at)),
          el('div', { class: 'to-log-what' }, el('b', {}, 기록글(r, unitId ? '' : (byId.get(r.unit_id)?.name ?? ''))), r.note ? el('span', { class: 'to-log-note' }, r.note) : null),
          el('span', { class: 'to-log-by' }, r.by || ''))))
        : el('p', { class: 'sec-empty' }, '아직 기록이 없습니다'),
    });
  }

  draw();
}

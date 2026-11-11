// 조직도 화면(#/org). 짜임새는 시트 방식 그대로 — 부모 상자가 밑에 딸린 칸 전체를 덮고, 깊이별 음영이 체계다.
// 자리 계산은 orgchart.js, 그리기는 orgpaint.js(TO표와 같이 쓴다). 자료는 records 의 'org' 기록 하나.
//
// 보기: 탭(전사 통합·맨 위 조직) · 찾기(거르지 않고 짚어 준다) · 크기 · CSV 내려받기 · 상자를 누르면 그 칸 정보.
// 고치기: [편집 모드] 를 켜면 상자를 눌러 이름·리더·소속을 고치고, 칸 밑 [＋ 구성원] 으로 사람을 더한다.
//         누르는 즉시 저장된다(초안·예약은 두지 않았다 — 혼자 또는 소수가 쓰는 달력이라 그걸로 충분하다).
import { el, replace } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, toast, field, selectBox, openDrawer } from './ui.js';
import { loadDoc, saveDoc } from './docs.js';
import { hashQuery } from './route.js';
import {
  ORG_ID, ALL_CARD, treeOf, flatten, topUnits, legendUnits, allRootOf, pathOf, layout, countPeople, isDual, isLegend,
  리더정보, 리더글, 상자글, 찾은것, 직군들, 직책들, 칸직책들,
} from './orgchart.js';
import { 상자, 격자, 가름선, 잡고밀기, 찾기칸, 찾은데로, 탭줄, 줌단추 } from './orgpaint.js';

const EMPTY = { rows: [], history: [] };
const state = { tab: ALL_CARD, zoom: 1, q: '', edit: false };
const newId = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function renderOrg(root, ctx) {
  root.replaceChildren(el('p', { class: 'lead-muted' }, '불러오는 중'));
  let doc;
  try { doc = await loadDoc(ctx.store, 'org', ORG_ID, EMPTY); } catch (e) {
    root.replaceChildren(el('div', { class: 'card sec-empty' }, icon('lock'), el('p', {}, e.message)));
    return;
  }
  const wanted = hashQuery(location.hash).get('tab');
  if (wanted) state.tab = wanted;
  if (!ctx.canEdit) state.edit = false;

  let settings = null;
  try { settings = await ctx.settings(); } catch { settings = null; }
  const 회사 = settings?.company?.short || '전사';

  let tree; let byId; let tops; let legends;
  function 세우기() {
    tree = treeOf(doc.rows);
    byId = new Map(flatten(tree).map((n) => [String(n.id), n]));
    tops = topUnits(tree);
    legends = legendUnits(tree);
    if (state.tab !== ALL_CARD && !byId.has(state.tab)) state.tab = ALL_CARD;
  }
  세우기();

  async function save(why) {
    const people = tops.reduce((n, r) => n + countPeople(r), 0);
    doc.history = [{ at: new Date().toISOString(), by: ctx.me.name, people, why: why || '저장' }, ...(doc.history ?? [])].slice(0, 50);
    try {
      await saveDoc(ctx.store, 'org', ORG_ID, doc);
      세우기();
      draw();
      if (why) toast(why);
    } catch (e) { toast(e.message, { error: true }); }
  }

  const 뿌리 = () => (state.tab === ALL_CARD ? allRootOf(tree, 회사) : byId.get(state.tab));
  const 전체인원 = () => tops.reduce((n, r) => n + countPeople(r), 0);

  // ── 참고사항 줄 ──
  function 참고사항줄() {
    if (!legends.length && !state.edit) return null;
    const cells = legends.map((u) => el('div', { class: 'oc-legend-cell' },
      el('span', { class: 'oc-legend-name' }, u.name, el('b', {}, String((u.children ?? []).length))),
      el('span', { class: 'oc-legend-who' },
        (u.children ?? []).length
          ? (u.children ?? []).map((p) => el('button', {
            type: 'button', class: 'oc-legend-one', title: [p.note, state.edit ? '눌러서 고치기' : ''].filter(Boolean).join(' — '),
            onclick: () => (state.edit ? 사람서랍(p) : 정보서랍(p)),
          }, p.name, 상자글(p) ? el('i', {}, `(${상자글(p)})`) : null, p.note ? el('u', {}, p.note) : null))
          : el('span', { class: 'oc-legend-none' }, '없음'),
        state.edit ? el('button', { type: 'button', class: 'oc-legend-add', title: `${u.name} 에 사람 더하기`, onclick: () => 사람서랍(null, u.id) }, icon('plus')) : null)));
    return el('div', { class: 'oc-legend' },
      el('div', { class: 'oc-legend-head' }, '참고사항', el('i', {}, '인원수에서 빠짐')),
      cells,
      state.edit ? el('button', { type: 'button', class: 'oc-legend-cell oc-legend-newcell', onclick: () => 참고사항칸추가() }, icon('plus'), ' 참고사항 칸') : null);
  }

  // ── 그림 ──
  function chartOf(root) {
    const 통합 = root.tag === 'virtual';
    const 판 = layout(root, { split: 통합 });
    const 찾은 = 찾은것(통합 ? tops : [root], state.q);
    const 더할것 = state.edit ? 판.nodes.filter((p) => p.kind === 'unit' && p.node.id && !(p.node.children ?? []).some((c) => c.kind === 'unit'))
      .map((p) => ({ node: p.node, col: p.col, row: p.row + 1 + (p.node.children ?? []).filter((c) => c.kind === 'person').length })) : [];
    const grid = 격자(판, { zoom: state.zoom, 더할줄: 더할것 });
    const parts = 판.nodes.map((p) => 상자(p, {
      수: p.kind === 'unit' ? countPeople(p.node) : '',
      found: Boolean(찾은?.has(p.node.id)),
      tip: state.edit ? '눌러서 고치기' : (p.node.id ? '눌러서 자세히' : ''),
      cls: p.node.id ? 'oc-click' : '',
    }));
    if (통합) {
      const 뿌리들 = 판.nodes.filter((p) => p.kind === 'unit' && tops.some((r) => r.id === p.node.id)).sort((a, b) => a.col - b.col);
      for (const p of 뿌리들.slice(1)) parts.push(가름선(p.col));
    }
    for (const a of 더할것) {
      parts.push(el('button', {
        type: 'button', class: 'oc-add', style: `grid-column:${a.col + 1} / span 1;grid-row:${a.row * 2 + 2}`, title: `${a.node.name} 에 구성원 추가`,
        onclick: (e) => { e.stopPropagation(); 사람서랍(null, a.node.id); },
      }, '＋ 구성원'));
    }
    replace(grid, parts);
    const 통 = el('div', { class: 'oc-scroll', tabindex: '0' }, grid);
    잡고밀기(통);
    통.addEventListener('click', (e) => {
      const box = e.target.closest('.oc-box[data-id]');
      const node = box ? byId.get(box.dataset.id) : null;
      if (!node) return;
      if (state.edit) { if (node.kind === 'unit') 칸서랍(node); else 사람서랍(node); } else 정보서랍(node);
    });
    const 표 = 찾은 ? el('p', { class: 'org-found' }, 찾은.size ? el('b', {}, `${찾은.size}건 짚었습니다`) : el('i', {}, '찾은 것이 없습니다')) : null;
    const sec = el('section', { class: 'oc-chart' }, 통);
    if (찾은?.size) setTimeout(() => 찾은데로(통), 0);
    return [표, sec];
  }

  function toolbar() {
    const 찾기 = 찾기칸({ placeholder: '이름·팀·직군으로 찾기', value: state.q, onChange: (q) => { state.q = q; 그림만다시(); } });
    return el('div', { class: 'org-bar' },
      찾기,
      줌단추(state.zoom, (z) => { state.zoom = z; draw(); }),
      el('button', { type: 'button', class: 'btn ghost', onclick: csv내려받기 }, icon('download'), 'CSV'),
      ctx.canEdit ? el('button', {
        type: 'button', class: `btn ${state.edit ? 'primary' : 'ghost'}`, 'aria-pressed': state.edit ? 'true' : 'false',
        onclick: () => { state.edit = !state.edit; draw(); },
      }, icon('edit'), state.edit ? '편집 모드 끄기' : '편집 모드') : null,
      state.edit ? el('button', { type: 'button', class: 'btn dark', onclick: () => 칸서랍(null, '') }, icon('plus'), '맨 위 조직') : null,
      doc.history?.[0] ? el('span', { class: 'org-at' }, `마지막 저장 ${doc.history[0].at.slice(0, 10)} · ${doc.history[0].by}`) : null);
  }

  let 그림자리 = null;
  function 그림만다시() {
    if (!그림자리) { draw(); return; }
    const 통 = 그림자리.querySelector('.oc-scroll');
    const x = 통?.scrollLeft ?? 0;
    replace(그림자리, chartOf(뿌리()));
    const 새통 = 그림자리.querySelector('.oc-scroll');
    if (새통 && !state.q) 새통.scrollLeft = x;
  }

  function draw() {
    const top = 뿌리();
    그림자리 = el('div', { class: 'org-chart-slot' }, top ? chartOf(top) : el('p', { class: 'org-empty' }, '조직도가 비어 있습니다. [편집 모드] 를 켜고 [맨 위 조직] 부터 만들어 보세요.'));
    replace(root, 참고사항줄(),
      탭줄({ tops, tab: state.tab, label: (id) => el('span', { class: 'org-tab-n' }, String(id === ALL_CARD ? 전체인원() : countPeople(byId.get(id))), el('i', {}, '명')), onPick: (id) => { state.tab = id; draw(); } }),
      toolbar(),
      state.edit ? el('p', { class: 'org-note' }, '편집 모드입니다. 상자를 누르면 고치고, 칸 밑 [＋ 구성원] 으로 사람을 더합니다. 누르는 즉시 저장됩니다.') : null,
      그림자리);
  }

  // ── 정보(읽기) ──
  function 정보서랍(node) {
    if (!node?.id) return;
    const 길 = pathOf(node.parent_id, byId);
    const body = el('div', {},
      node.kind === 'unit'
        ? [el('div', { class: 'kv' }, el('span', {}, '소속'), el('b', {}, 길 || '맨 위')),
          el('div', { class: 'kv' }, el('span', {}, '리더'), el('b', {}, 리더정보(node) ? `${리더정보(node).이름}${리더정보(node).직책 ? ` (${리더정보(node).직책}${리더정보(node).겸 ? ' 겸' : ''})` : ''}` : '-')),
          el('div', { class: 'kv' }, el('span', {}, '인원'), el('b', {}, `${countPeople(node)}명`)),
          el('div', { class: 'kv' }, el('span', {}, '하위 조직'), el('b', {}, String((node.children ?? []).filter((c) => c.kind === 'unit').length))),
          node.note ? el('div', { class: 'kv' }, el('span', {}, '메모'), el('b', {}, node.note)) : null,
          el('ul', { class: 'home-list', style: 'margin-top:12px' }, (node.children ?? []).filter((c) => c.kind === 'person').map((p) => el('li', {}, el('span', {}, p.name), el('small', {}, 상자글(p) + (isDual(p) ? ' · 겸직' : '')))))]
        : [el('div', { class: 'kv' }, el('span', {}, '소속'), el('b', {}, 길)),
          el('div', { class: 'kv' }, el('span', {}, '직군'), el('b', {}, node.job || '-')),
          el('div', { class: 'kv' }, el('span', {}, '직책'), el('b', {}, node.title || '파트원')),
          isDual(node) ? el('div', { class: 'kv' }, el('span', {}, '겸직'), el('b', {}, '예 (인원수에 세지 않음)')) : null,
          node.note ? el('div', { class: 'kv' }, el('span', {}, '메모'), el('b', {}, node.note)) : null],
      ctx.canEdit ? el('p', { class: 'lead-muted', style: 'margin-top:14px' }, '고치려면 [편집 모드] 를 켜고 다시 누르세요.') : null);
    openDrawer({ title: node.name, lead: chip(icon(node.kind === 'unit' ? 'sitemap' : 'users')), body });
  }

  // ── 조직 칸 고치기 ──
  const 자손인가 = (id, of) => { for (let n = byId.get(String(id)); n; n = byId.get(String(n.parent_id ?? ''))) if (n.id === of) return true; return false; };
  const 상위고르기 = (self, chosen, { legend = false } = {}) => selectBox('상위 조직',
    [['', legend ? '(참고사항 아님)' : '맨 위(탭 하나가 된다)'], ...flatten(tree).filter((n) => n.kind === 'unit' && n.id !== self && !(self && 자손인가(n.id, self)) && (legend || !isLegend(n)))
      .map((n) => [n.id, (isLegend(n) ? '참고사항 › ' : '') + pathOf(n.id, byId)])], chosen ?? '');
  const 다음자리 = (parent) => Math.max(-1, ...doc.rows.filter((r) => String(r.parent_id ?? '') === String(parent ?? '')).map((r) => Number(r.position) || 0)) + 1;

  function 칸서랍(node, parentId = '') {
    const 새것 = !node;
    const v = node ?? { id: newId('u'), parent_id: parentId, kind: 'unit', name: '', role: '', job: '', title: '', dual: 0, tag: '', note: '' };
    const 리더 = 리더정보(v) ?? { 이름: '', 직책: '', 겸: false };
    const name = el('input', { type: 'text', value: v.name, placeholder: '예: 서버 파트' });
    const lead = el('input', { type: 'text', value: 리더.이름, placeholder: '칸 안에 적히는 리더 성함(비우면 없음)' });
    const title = selectBox('리더 직책', [['', '(직책 없음)'], ...칸직책들.map((t) => [t, t])], 리더.직책);
    const dual = el('input', { type: 'checkbox', checked: 리더.겸 });
    const parent = 상위고르기(v.id, v.parent_id);
    const note = el('input', { type: 'text', value: v.note || '', placeholder: '메모(마음대로)' });
    const kids = (node?.children ?? []).length;
    const 형제 = () => doc.rows.filter((r) => String(r.parent_id ?? '') === String(v.parent_id ?? '') && r.kind === 'unit' && isLegend(r) === isLegend(v)).sort((a, b) => a.position - b.position);
    const 옮김 = (dir) => {
      const 들 = 형제();
      const i = 들.findIndex((r) => r.id === v.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= 들.length) return;
      const a = 들[i].position; 들[i].position = 들[j].position; 들[j].position = a;
      ctl.close();
      save(dir < 0 ? '앞으로 옮겼습니다' : '뒤로 옮겼습니다');
    };
    const form = el('form', { class: 'd-form' },
      field('조직 이름', name),
      field('리더 성함', lead, '시트처럼 조직 칸 안에 \'팀장 / 홍길동\' 으로 적힙니다. 인원수에 한 명으로 셉니다(겸직이면 안 셉니다).'),
      field('리더 직책', title),
      el('label', { class: 'check' }, dual, ' 겸직(다른 칸에도 있는 사람)'),
      field('상위 조직', parent),
      field('메모', note));
    const 단추들 = 새것 ? null : el('div', { class: 'org-acts' },
      el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { ctl.close(); 칸서랍(null, v.id); } }, icon('plus'), '하위 조직'),
      el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { ctl.close(); 사람서랍(null, v.id); } }, icon('user-add'), '구성원'),
      el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 옮김(-1) }, icon('left'), '앞으로'),
      el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 옮김(1) }, '뒤로', icon('right')),
      el('button', { type: 'button', class: 'btn danger sm', disabled: kids > 0, title: kids ? '밑에 딸린 것을 먼저 옮기거나 지워야 합니다' : '', onclick: async () => {
        if (!await confirmBox({ title: `'${v.name}' 칸을 지울까요?`, confirm: '지우기', danger: true })) return;
        doc.rows = doc.rows.filter((r) => r.id !== v.id);
        ctl.close();
        save('지웠습니다');
      } }, icon('trash'), '지우기'));
    const ctl = openDrawer({
      title: 새것 ? (parentId ? `${byId.get(parentId)?.name ?? ''} 에 하위 조직 추가` : '맨 위 조직 추가') : `${v.name} 고치기`,
      lead: chip(icon('sitemap')),
      body: el('div', {}, form, 단추들),
      footer: el('button', { type: 'button', class: 'btn primary', onclick: () => {
        if (!name.value.trim()) { toast('조직 이름을 적어 주세요', { error: true }); return; }
        const next = { ...v, name: name.value.trim(), role: 리더글(lead.value, title.value, dual.checked), dual: 0, parent_id: parent.value, note: note.value.trim() };
        if (String(next.parent_id ?? '') !== String(v.parent_id ?? '') || 새것) next.position = 다음자리(next.parent_id);
        const at = doc.rows.findIndex((r) => r.id === v.id);
        if (at >= 0) doc.rows[at] = next; else doc.rows.push(next);
        ctl.close();
        save(새것 ? '조직을 만들었습니다' : '고쳤습니다');
      } }, '저장'),
    });
    setTimeout(() => name.focus(), 50);
  }

  function 참고사항칸추가() {
    const name = el('input', { type: 'text', placeholder: '예: 경영진, 출장/휴직/기타, 퇴직예정자' });
    const ctl = openDrawer({
      title: '참고사항 칸 추가', lead: chip(icon('info')),
      body: el('div', {}, el('p', { class: 'lead-muted', style: 'margin-bottom:12px' }, '참고사항에 적힌 사람은 인원수에서 빠집니다. 조직에서 자리를 비운 사람(휴직·퇴직예정)이나 경영진처럼 소속으로 세지 않는 사람을 둡니다.'), field('칸 이름', name)),
      footer: el('button', { type: 'button', class: 'btn primary', onclick: () => {
        if (!name.value.trim()) { toast('칸 이름을 적어 주세요', { error: true }); return; }
        doc.rows.push({ id: newId('l'), parent_id: '', kind: 'unit', name: name.value.trim(), role: '', job: '', title: '', dual: 0, tag: 'legend', position: 다음자리(''), note: '' });
        ctl.close();
        save('참고사항 칸을 만들었습니다');
      } }, '저장'),
    });
    setTimeout(() => name.focus(), 50);
  }

  // ── 사람 고치기 ──
  async function 사람서랍(node, parentId = '') {
    const 새것 = !node;
    const v = node ?? { id: newId('p'), parent_id: parentId, kind: 'person', name: '', role: '', job: '', title: '파트원', dual: 0, tag: '', note: '' };
    let staff = [];
    try { staff = (await ctx.store.records('staff')).map((r) => r.data).filter((s) => !s.left); } catch { staff = []; }
    const name = el('input', { type: 'text', value: v.name, placeholder: '이름' });
    const job = selectBox('직군', [['', '(없음)'], ...직군들.map((j) => [j, j])], v.job || '');
    const title = selectBox('직책', 직책들.map((t) => [t, t]), v.title || '파트원');
    const dual = el('input', { type: 'checkbox', checked: Boolean(v.dual) });
    const parent = 상위고르기('', v.parent_id, { legend: true });
    const note = el('input', { type: 'text', value: v.note || '', placeholder: '메모 — 참고사항 칸이면 왜 비웠는지(휴직 기간 등)' });
    const pick = staff.length ? selectBox('직원명부에서 고르기', [['', '직원명부에서 채우기(선택)'], ...staff.map((s) => [s.emp_no || s.name, `${s.name} · ${[s.dept, s.team, s.part].filter(Boolean).join(' ')}`])], '') : null;
    pick?.addEventListener('change', () => {
      const s = staff.find((x) => (x.emp_no || x.name) === pick.value);
      if (!s) return;
      name.value = s.name;
      if (직군들.includes(s.job_group)) job.value = s.job_group;
      if (직책들.includes(s.title)) title.value = s.title;
    });
    const 형제 = () => doc.rows.filter((r) => String(r.parent_id ?? '') === String(v.parent_id ?? '') && r.kind === 'person').sort((a, b) => a.position - b.position);
    const 옮김 = (dir) => {
      const 들 = 형제();
      const i = 들.findIndex((r) => r.id === v.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= 들.length) return;
      const a = 들[i].position; 들[i].position = 들[j].position; 들[j].position = a;
      ctl.close();
      save(dir < 0 ? '위로 옮겼습니다' : '아래로 옮겼습니다');
    };
    const form = el('form', { class: 'd-form' },
      pick ? field('직원명부', pick) : null,
      field('이름', name),
      field('직군', job, '상자 이름 밑에 직책이 파트장 이상이면 직책, 아니면 직군이 적힙니다.'),
      field('직책', title),
      el('label', { class: 'check' }, dual, ' 겸직 — 점선 상자로 그리고 인원수에 세지 않습니다'),
      field('소속', parent),
      field('메모', note));
    const 단추들 = 새것 ? null : el('div', { class: 'org-acts' },
      el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 옮김(-1) }, icon('up'), '위로'),
      el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 옮김(1) }, icon('down'), '아래로'),
      el('button', { type: 'button', class: 'btn danger sm', onclick: async () => {
        if (!await confirmBox({ title: `${v.name} 을(를) 조직도에서 뺄까요?`, message: '직원명부에는 영향이 없습니다.', confirm: '빼기', danger: true })) return;
        doc.rows = doc.rows.filter((r) => r.id !== v.id);
        ctl.close();
        save('뺐습니다');
      } }, icon('trash'), '빼기'));
    const ctl = openDrawer({
      title: 새것 ? `${byId.get(parentId)?.name ?? ''} 에 구성원 추가` : `${v.name} 고치기`,
      lead: chip(icon('user-add')),
      body: el('div', {}, form, 단추들),
      footer: el('button', { type: 'button', class: 'btn primary', onclick: () => {
        if (!name.value.trim()) { toast('이름을 적어 주세요', { error: true }); return; }
        if (!parent.value) { toast('소속을 골라 주세요', { error: true }); return; }
        const p = byId.get(parent.value);
        const next = { ...v, name: name.value.trim(), job: job.value, title: title.value, dual: dual.checked ? 1 : 0, parent_id: parent.value, tag: isLegend(p) ? 'legend' : '', note: note.value.trim() };
        if (String(next.parent_id ?? '') !== String(v.parent_id ?? '') || 새것) next.position = 다음자리(next.parent_id);
        const at = doc.rows.findIndex((r) => r.id === v.id);
        if (at >= 0) doc.rows[at] = next; else doc.rows.push(next);
        ctl.close();
        save(새것 ? '구성원을 더했습니다' : '고쳤습니다');
      } }, '저장'),
    });
    setTimeout(() => name.focus(), 50);
  }

  // ── CSV ──
  function csv내려받기() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['경로', '이름', '종류', '직군', '직책', '겸직', '리더', '참고사항', '메모']];
    for (const n of flatten(tree)) {
      const 리더 = 리더정보(n);
      lines.push([pathOf(n.parent_id, byId), n.name, n.kind === 'unit' ? '조직' : '사람', n.job || '', n.kind === 'unit' ? (리더?.직책 || '') : (n.title || ''), isDual(n) ? '예' : '', 리더?.이름 || '', isLegend(n) ? '예' : '', n.note || '']);
    }
    const blob = new Blob(['﻿' + lines.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `조직도_${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
  }

  draw();
}

// 홈 화면. 앱에 들어오면 처음 보는 자리다.
//   위     날짜 · 할 일 수 · [캘린더 열기]
//   가운데  오늘 할 일(체크로 완료) | 자동화 현황 카드(관리자 — 탭: 신규 입사자·예약·확인 필요)
//   아래    조직도 인원 카드 줄(관리자에게는 TO 숫자도) · 어떻게 쓰나요 · 모드 안내
//   오른쪽 아래에 떠 있는 [할 일] 단추 — 일정 추가 서랍을 바로 연다.
import { el } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, toast } from './ui.js';
import { hashOf } from './route.js';
import { calendarForm } from './forms.js';
import { openHire } from './hireview.js';
import { AUTOS } from './autoview.js';
import { loadDoc } from './docs.js';
import { ORG_ID, TO_ID, treeOf, topUnits, countPeople, 세기, 합계 } from './orgchart.js';
import { todayYmd, 요일글 } from './autotext.js';
import { 챙길것, 첫탭, todayTasks, 받을달들, 일정합치기, 이번주수, 완료묻기글, 할일날짜 } from './homecare.js';
import { 지난예약처리 } from './autobook.js';

const state = { homeTab: '' };

// ── 위 줄: 날짜와 할 일 수 ──
function 머리(today, tasks, 이번주) {
  const 목록 = tasks === 'error' ? null : tasks;
  const left = (목록?.list ?? []).filter((t) => !t.done).length + (목록?.more ?? 0);
  const late = (목록?.list ?? []).filter((t) => !t.done && t.late).length;
  const line = tasks === 'error'
    ? el('p', { class: 'hm-line' }, '할 일을 불러오지 못했습니다')
    : 목록 === null
      ? el('p', { class: 'hm-line' }, '불러오는 중')
      : left
        ? el('p', { class: 'hm-line' }, `할 일 ${left}건`, late ? el('em', {}, ` · 지난 것 ${late}건`) : null)
        : el('p', { class: 'hm-line' }, 이번주 ? `오늘은 비어 있습니다 · 이번 주 ${이번주}건` : '오늘은 비어 있습니다');
  return el('div', { class: 'hm-top' },
    el('div', { class: 'hm-date' },
      el('span', { class: 'hm-md' }, `${Number(today.slice(5, 7))}.${Number(today.slice(8, 10))}`),
      el('span', { class: 'hm-dow' }, 요일글(today))),
    line,
    el('a', { class: 'btn ghost hm-calbtn', href: hashOf('calendar') }, icon('calendar'), '캘린더 열기'));
}

// ── 오늘 할 일 ──
function 할일판(tasks, canEdit, onDone, again) {
  const 목록 = tasks === 'error' || tasks === null ? null : tasks;
  const 남은수 = 목록 ? 목록.list.filter((t) => !t.done).length + 목록.more : 0;
  return el('section', { class: 'hm-panel hm-todo' },
    el('h3', {}, '오늘 할 일', 목록 && 남은수 ? el('span', { class: 'hm-cnt' }, String(남은수)) : null),
    tasks === 'error'
      ? el('p', { class: 'hm-quiet' }, '할 일을 불러오지 못했습니다. ', el('button', { type: 'button', class: 'hm-retry', onclick: () => again() }, '다시 시도'))
      : 목록 === null
        ? el('p', { class: 'hm-quiet' }, '불러오는 중')
        : 목록.list.length
          ? el('ul', { class: 'hm-tasks' }, 목록.list.map((it) => taskRow(it, canEdit, onDone, again)))
          : el('p', { class: 'hm-quiet' }, '오늘 기한인 일정이 없습니다.'),
    목록?.more ? el('a', { class: 'hm-more', href: hashOf('calendar') }, `${목록.more}건 더 — 캘린더에서 보기`) : null);
}

function taskRow(it, canEdit, onDone, after) {
  const box = el('input', { type: 'checkbox', 'aria-label': `${it.title} 했어요`, disabled: !canEdit || it.can_edit === false });
  box.checked = Boolean(it.done);
  box.addEventListener('change', async () => {
    // 체크할 때만 묻는다. 체크를 푸는 것은 바로 된다(알림으로 알린다).
    if (box.checked && !(await confirmBox(완료묻기글(it)))) { box.checked = false; return; }
    box.disabled = true;
    const ok = await onDone(it.id, it.due, box.checked);
    box.disabled = false;
    if (!ok) { box.checked = !box.checked; return; }
    it.done = box.checked;
    toast(box.checked ? '했어요로 적었습니다' : '다시 할 일로 되돌렸습니다');
    after();
  });
  const 늦음 = it.late && !it.done;
  return el('li', { class: 'hm-task' + (it.done ? ' done' : '') + (늦음 ? ' late' : '') },
    el('label', { class: 'hm-check' }, box, el('span', { class: 'hm-tasktitle' }, it.title), it.lead ? el('small', { class: 'hm-lead' }, it.lead) : null),
    늦음 ? el('span', { class: 'hm-late' }, '지남') : null,
    el('span', { class: 'hm-due' }, 할일날짜(it.due)));
}

// ── 자동화 현황 카드(관리자) ──
function 현황카드(care, ctx, again, redraw) {
  const 못받음 = (글) => el('p', { class: 'hm-quiet' }, 글);
  const 입사자줄 = (r) => el('li', {}, el('button', {
    type: 'button', class: 'hm-careitem' + (r.늦음 ? ' bad' : ''),
    title: [r.name, r.dept].filter(Boolean).join(' · '),
    onclick: async () => {
      try {
        const rows = await ctx.store.records('hire');
        const row = rows.find((x) => x.id === r.id);
        if (row) openHire(ctx, row, again); else toast('그 입사자를 찾지 못했습니다', { error: true });
      } catch (e) { toast(e.message, { error: true }); }
    },
  },
  el('span', { class: 'hm-caredate' + (r.늦음 ? ' bad' : '') }, r.날 || '미정', r.날 ? el('small', {}, r.남은) : null),
  el('span', { class: 'hm-caretext' }, el('b', {}, r.name), r.dept ? el('span', {}, r.dept) : null),
  el('span', { class: 'hm-carepill' + (r.결 ? ` ${r.결}` : '') }, r.알약)));
  const 일줄 = (r, { bad = false } = {}) => el('li', {}, el('a', {
    class: 'hm-careitem' + (bad ? ' bad' : ''), href: hashOf('auto:' + r.autoId), title: [r.제목, r.덧글].filter(Boolean).join(' — '),
  },
  chip(icon(r.icon)),
  el('span', { class: 'hm-caretext' }, el('b', {}, r.제목), r.덧글 ? el('span', {}, r.덧글) : null),
  r.때 ? el('span', { class: 'hm-carepill' }, r.때) : null));

  const 탭들 = [
    ['입사자', '신규 입사자', care?.입사자 ? care.입사자.줄 : null, false, '진행 중인 신규 입사자가 없습니다.', 입사자줄],
    ['예약', '예약', care?.예약 ?? null, false, '기다리는 예약이 없습니다.', (r) => 일줄(r)],
    ['확인', '확인 필요', care?.확인 ?? null, true, '최근 14일 동안 실패한 것이 없습니다.', (r) => 일줄(r, { bad: true })],
  ];
  const 고른 = 탭들.some(([k]) => k === state.homeTab) ? state.homeTab : (care ? 첫탭(care) : '입사자');
  const [, 고른이름, 목록, , 빈글, 그리기] = 탭들.find(([k]) => k === 고른);
  const 탭줄 = el('div', { class: 'hm-tabs', role: 'tablist', 'aria-label': '자동화 현황' },
    ...탭들.map(([k, 이름, 줄, bad]) => el('button', {
      type: 'button', class: 'hm-tab' + (k === 고른 ? ' on' : ''), role: 'tab', 'aria-selected': k === 고른 ? 'true' : 'false',
      onclick: () => { state.homeTab = k; redraw(); },
    }, 이름, 줄?.length ? el('b', { class: bad ? 'bad' : null }, String(줄.length)) : null)));
  const 몸 = care === null
    ? 못받음('불러오는 중')
    : 목록 === null
      ? el('p', { class: 'hm-quiet' }, `${고른이름}을(를) 불러오지 못했습니다. `, el('button', { type: 'button', class: 'hm-retry', onclick: () => again() }, '다시 시도'))
      : 목록.length ? el('ul', { class: 'hm-carelist' }, 목록.map(그리기)) : 못받음(빈글);
  return el('section', { class: 'hm-panel hm-care' },
    el('div', { class: 'hm-panelhead' }, el('h3', {}, '자동화 현황'), el('a', { class: 'hm-link', href: hashOf('auto') }, '자동화 전체')),
    탭줄,
    el('div', { class: 'hm-tabpanel', role: 'tabpanel' },
      몸,
      고른 === '입사자' && 목록?.length ? el('a', { class: 'hm-more', href: hashOf('hire') }, '신규 입사자 화면에서 보기') : null));
}

// ── 조직도 인원 카드 줄 ──
function 인원줄(cards) {
  if (cards === null) return el('div', { class: 'hm-orgs' }, el('p', { class: 'hm-quiet' }, '조직도 인원을 불러오는 중'));
  if (cards === 'error') return el('div', { class: 'hm-orgs' }, el('p', { class: 'hm-quiet' }, '조직도 인원을 불러오지 못했습니다.'));
  if (!cards.length) return el('div', { class: 'hm-orgs' }, el('p', { class: 'hm-quiet' }, '조직도가 아직 비어 있습니다. [조직도] 에서 만들어 보세요.'));
  const 칸 = (이름, 수, cls = '') => el('span', { class: 'hm-to-one' + (cls ? ` ${cls}` : '') }, 이름, el('b', {}, String(수)));
  return el('nav', { class: 'hm-orgs', 'aria-label': '조직도 인원' }, cards.map((k) => el('div', { class: 'hm-org' + (k.all ? ' all' : '') },
    el('a', { class: 'hm-orglink', href: hashOf('org') + (k.id ? `?tab=${k.id}` : ''), 'aria-label': `${k.name} 조직도 보기 — ${k.수}명` }),
    el('span', { class: 'hm-orgname' }, k.name),
    el('span', { class: 'hm-orgn' }, String(k.수), el('i', {}, '명')),
    k.to ? el('a', { class: 'hm-to', href: hashOf('to') + (k.id ? `?tab=${k.id}` : '') },
      칸('최종 TO', k.to.최종), 칸('잔여', k.to.잔여, k.to.잔여 ? 'rest' : ''),
      k.to.채용중 ? 칸('채용 중', k.to.채용중) : null, k.to.입사예정 ? 칸('입사 예정', k.to.입사예정) : null) : null)));
}

async function 인원받기(store) {
  const org = await loadDoc(store, 'org', ORG_ID, { rows: [] });
  const tree = treeOf(org.rows);
  const tops = topUnits(tree);
  let counts = null;
  try { counts = 세기(tree, (await loadDoc(store, 'to', TO_ID, { seats: [] })).seats); } catch { counts = null; }
  if (!tops.length) return [];
  const c = (id) => counts?.get(String(id)) ?? null;
  const all = counts ? 합계(tops.map((r) => ({ depth: 0, c: c(r.id) }))) : null;
  return [
    { id: '', all: true, name: '전사 통합', 수: tops.reduce((n, r) => n + countPeople(r), 0), to: all },
    ...tops.map((r) => ({ id: r.id, name: r.name, 수: countPeople(r), to: c(r.id) })),
  ];
}

export async function renderHome(root, ctx, { mode }) {
  const today = todayYmd();
  const at = (renderHome.seq = (renderHome.seq ?? 0) + 1);
  let tasks = null;
  let 이번주 = 0;
  let cards = null;
  let care = null;
  let monthData = null;

  const draw = () => {
    if (renderHome.seq !== at || !root.isConnected) return;
    root.replaceChildren(
      머리(today, tasks, 이번주),
      el('div', { class: 'hm-row' + (ctx.canEdit ? '' : ' one') },
        할일판(tasks, ctx.canEdit, (id, due, done) => ctx.store.setDone(id, due, done).then(() => true).catch((e) => { toast(e.message, { error: true }); return false; }), again),
        ctx.canEdit ? 현황카드(care, ctx, 챙길다시, draw) : null),
      인원줄(cards),
      el('div', { class: 'home-grid' },
        el('div', { class: 'card home-autos' },
          el('div', { class: 'home-autos-head' }, el('h3', {}, '자동화'), el('a', { href: hashOf('auto') }, '전체 보기')),
          el('div', { class: 'home-auto-grid' },
            el('a', { class: 'home-auto', href: hashOf('hire') }, el('span', { class: 'chip' }, icon('user-add')), el('span', {}, '신규 입사자'), icon('right')),
            ...AUTOS.map((a) => el('a', { class: 'home-auto', href: hashOf('auto:' + a.id) }, el('span', { class: 'chip' }, icon(a.icon)), el('span', {}, a.title), icon('right'))),
            el('a', { class: 'home-auto', href: hashOf('cert') }, el('span', { class: 'chip' }, icon('doc')), el('span', {}, '증명서 발급'), icon('right')),
            el('a', { class: 'home-auto', href: hashOf('welfare') }, el('span', { class: 'chip' }, icon('card')), el('span', {}, '복지카드'), icon('right')))),
        el('div', { class: 'card' },
          el('h3', {}, '어떻게 쓰나요'),
          el('p', {}, '① 캘린더에 급여·세무·복지 같은 반복 업무를 올려 두고 한 일은 홈이나 캘린더에서 완료 체크합니다. ② 신규 입사자는 등록하면 일정·공지·안내 메일·계약서 엑셀·명부 등재를 한 자리에서 처리합니다. ③ 급여 공지는 미리보기를 본 뒤 실행하거나 예약합니다. ④ 복지카드는 매달 명단을 확인해 품의·카드사·재무팀 파일을 만듭니다.')),
        el('div', { class: 'card' }, el('h3', {}, mode.title), el('p', {}, mode.text))),
      ctx.canEdit ? el('button', {
        type: 'button', class: 'hm-fab',
        onclick: () => {
          if (!monthData) { toast('캘린더 분야를 아직 못 받았습니다. 잠시 뒤 다시 눌러 주세요', { error: true }); return; }
          calendarForm({
            heading: '일정 추가', start: today, categories: monthData.categories,
            onSave: async (values) => { await ctx.store.create(values); toast('저장했습니다'); again(); },
          });
        },
      }, icon('plus'), '할 일') : null);
  };

  // 오늘 할 일은 이 달 일정에서 고른다 — 월초에는 지난달 일정도 받아 합친다. 체크·추가 뒤에는 이것만 다시 받는다.
  async function again() {
    try {
      const 달들 = await Promise.all(받을달들(today).map((m) => ctx.store.month(m)));
      monthData = 달들[달들.length - 1];
      const items = 일정합치기(달들.map((data) => data?.items ?? []));
      tasks = todayTasks(items, today);
      이번주 = 이번주수(items, today);
    } catch { tasks = 'error'; }
    draw();
  }
  async function 챙길다시() {
    if (!ctx.canEdit) return;
    await 지난예약처리(ctx).catch(() => 0);
    const 받기 = (kind) => ctx.store.records(kind).catch(() => null);
    const [hires, runs, books] = await Promise.all([받기('hire'), 받기('run'), 받기('book')]);
    care = 챙길것({ hires, runs, books, autos: AUTOS }, today);
    draw();
  }

  draw();
  await Promise.all([
    again(),
    챙길다시(),
    (async () => { try { cards = await 인원받기(ctx.store); } catch { cards = 'error'; } draw(); })(),
  ]);
}

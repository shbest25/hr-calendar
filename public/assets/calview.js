// 캘린더 화면. 날짜 계산은 store(서버 또는 로컬)가 하고, 여기서는 받은 회차를 날짜 칸에 꽂기만 한다.
import { el, append } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, iconButton, openDrawer, toast } from './ui.js';
import { calendarForm, categoryDrawer } from './forms.js';
import { monthOf, ymd, parse, weeksOf } from './repeat.js';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 보고 있는 달과 마지막 응답. 화면을 다시 그려도 보던 달이 유지된다.
let cursor = monthOf(new Date());
let loaded = null;

// 편집 모드. 평소에는 칩을 눌러 완료 체크만 하고, 켜야 추가·고치기·지우기를 한다.
let editing = false;

// 공유 모드에서 로그인하지 않은 방문자는 보기만 한다(서버 규칙이 쓰기를 막지만, 화면에서도 미리 감춘다).
const viewerOnly = (data) => !!data && data.can_edit === false;

const colorOf = (data, key) => data.categories.find((c) => c.key === key)?.color ?? '#616161';
const labelOf = (data, key) => data.categories.find((c) => c.key === key)?.label ?? '기타';

// ---------- 서랍 열기 ----------
async function openItemForm(store, data, { id = null, start = '' }, refresh) {
  let item = null;
  if (id) {
    try { item = await store.get(id); } catch (e) { toast(e.message); return; }
  }
  calendarForm({
    heading: id ? '일정 고치기' : '일정 추가',
    item,
    start,
    categories: data.categories,
    onSave: async (values) => {
      if (id) await store.update(id, values); else await store.create(values);
      toast('저장했습니다');
      refresh();
    },
    onDelete: id ? async () => { await store.remove(id); toast('지웠습니다'); refresh(); } : null,
  });
}

function openCategories(store, data, refresh) {
  categoryDrawer({
    categories: data.categories,
    inUse: [...new Set(data.items.map((x) => x.category))],
    onSave: async (rows) => { await store.saveCategories(rows); toast('분야를 저장했습니다'); refresh(); },
  });
}

// 하루 서랍: 그날 일정 목록. 체크로 완료를 바꾸고, 편집 모드면 고치기·추가.
function dayDrawer(store, data, date, refresh) {
  const items = data.items.filter((x) => x.due === date);
  const holiday = data.holidays.find((h) => h.date === date);
  const body = el('div', {},
    holiday ? el('p', { class: 'holi-note' }, holiday.name) : null,
    items.length
      ? el('ul', { class: 'u-list' }, items.map((it) => {
        const row = el('li', { class: 'u-row' + (it.done ? ' done' : '') });
        const box = el('input', { type: 'checkbox', 'aria-label': '했음', checked: it.done, disabled: !it.can_edit });
        box.addEventListener('change', async () => {
          try {
            await store.setDone(it.id, it.due, box.checked);
            row.classList.toggle('done', box.checked);
            refresh();
          } catch (e) {
            box.checked = !box.checked;
            toast(e.message);
          }
        });
        const dot = el('span', { class: 'cal-dot' });
        dot.style.background = colorOf(data, it.category);
        return append(row,
          box,
          el('div', { class: 'u-main' },
            el('span', { class: 'u-title' }, it.title),
            el('span', { class: 'u-sub' }, [
              labelOf(data, it.category),
              it.lead ? '담당 ' + it.lead + (it.deputy ? ' · 부 ' + it.deputy : '') : null,
              it.note || null,
            ].filter(Boolean).join(' · '))),
          dot,
          editing && it.can_edit ? iconButton('edit', '고치기', () => openItemForm(store, data, { id: it.id }, refresh)) : null);
      }))
      : el('p', { class: 'sec-empty' }, '이 날에는 일정이 없습니다'));

  openDrawer({
    title: Number(date.slice(5, 7)) + '월 ' + Number(date.slice(8, 10)) + '일',
    lead: chip(icon('calendar')),
    body,
    footer: viewerOnly(data)
      ? el('p', { class: 'lead-muted' }, '보기 전용입니다. 관리자가 로그인하면 체크·수정할 수 있습니다.')
      : editing
        ? el('button', { type: 'button', class: 'btn primary', onclick: () => openItemForm(store, data, { start: date }, refresh) }, icon('plus'), '이 날에 일정 추가')
        : el('p', { class: 'lead-muted' }, '체크는 여기서 바로 합니다. 더하거나 고치려면 [편집 모드]를 켜세요.'),
  });
}

// ---------- 달력 조각 ----------
function itemChip(store, data, it, refresh) {
  const dot = el('span', { class: 'cal-dot' });
  dot.style.background = colorOf(data, it.category);
  const canEdit = editing && it.can_edit;
  const hint = !it.can_edit ? '눌러서 자세히 보기' : canEdit ? '눌러서 고치기' : it.done ? '눌러서 완료 풀기' : '눌러서 완료 체크';
  return el('button', {
    type: 'button',
    class: 'cal-chip' + (it.done ? ' done' : ''),
    style: '--c:' + colorOf(data, it.category), // 분야 색을 CSS 변수로 넘겨 연한 배경과 왼쪽 띠에 쓴다
    title: labelOf(data, it.category) + ' · ' + it.title + (it.lead ? ' · 담당 ' + it.lead : '') + ' — ' + hint,
    onclick: async (e) => {
      e.stopPropagation();
      if (!it.can_edit) { dayDrawer(store, data, it.due, refresh); return; } // 방문자는 그날 목록만 본다
      if (canEdit) { openItemForm(store, data, { id: it.id }, refresh); return; }
      // 달력 칸은 좁아 스치듯 눌리기 쉬우니 한 번 더 묻는다.
      const ok = await confirmBox(it.done
        ? { title: `'${it.title}' 완료를 풀까요?`, message: '아직 하지 않은 일로 되돌아갑니다.', confirm: '완료 풀기', danger: true }
        : { title: `'${it.title}' 을(를) 완료하셨습니까?`, message: '달력에 완료로 적힙니다.', confirm: '네, 완료했습니다' });
      if (!ok) return;
      try { await store.setDone(it.id, it.due, !it.done); refresh(); } catch (err) { toast(err.message); }
    },
  }, dot, el('span', { class: 'cal-chip-text' }, it.title));
}

function head(data, store, refresh) {
  const move = (step) => {
    const d = parse(cursor + '-01');
    d.setMonth(d.getMonth() + step);
    cursor = monthOf(d);
    refresh();
  };
  return el('div', { class: 'cal-head' },
    chip(icon('calendar')),
    el('h2', {}, cursor.slice(0, 4) + '년 ' + Number(cursor.slice(5, 7)) + '월'),
    el('div', { class: 'cal-nav' },
      iconButton('left', '지난달', () => move(-1)),
      iconButton('right', '다음달', () => move(1)),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => { cursor = monthOf(new Date()); refresh(); } }, '오늘')),
    el('div', { class: 'cal-tools' },
      viewerOnly(data)
        ? el('span', { class: 'lead-muted' }, '보기 전용')
        : el('button', {
          type: 'button',
          class: 'btn ' + (editing ? 'primary' : 'ghost'),
          'aria-pressed': editing ? 'true' : 'false',
          title: editing ? '끄면 눌러서 완료 체크만 됩니다' : '켜면 일정을 더하고 고칠 수 있습니다',
          onclick: () => { editing = !editing; refresh(); },
        }, icon('edit'), editing ? '편집 모드 끄기' : '편집 모드'),
      editing && data && !viewerOnly(data)
        ? el('button', { type: 'button', class: 'btn dark', onclick: () => openItemForm(store, data, { start: ymd(new Date()) }, refresh) }, icon('plus'), '일정 추가')
        : null));
}

function grid(store, data, refresh) {
  const today = ymd(new Date());
  const box = el('div', { class: 'cal-grid' },
    DOW.map((d, i) => el('div', { class: 'cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') }, d)));
  for (const week of weeksOf(cursor)) {
    for (const date of week) {
      const key = ymd(date);
      const out = monthOf(date) !== cursor;
      const holiday = data.holidays.find((h) => h.date === key);
      const items = data.items.filter((x) => x.due === key);
      const classes = ['cal-day'];
      if (out) classes.push('out');
      if (key === today) classes.push('today');
      if (holiday || date.getDay() === 0) classes.push('sun');
      else if (date.getDay() === 6) classes.push('sat');
      box.append(el('div', { class: classes.join(' '), role: 'button', tabindex: '0', onclick: () => dayDrawer(store, data, key, refresh),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dayDrawer(store, data, key, refresh); } } },
      el('div', { class: 'cal-num' },
        el('span', {}, String(date.getDate())),
        holiday ? el('span', { class: 'cal-holi' }, holiday.name) : null),
      el('div', { class: 'cal-items' },
        items.slice(0, 3).map((it) => itemChip(store, data, it, refresh)),
        items.length > 3 ? el('span', { class: 'cal-more' }, '+' + (items.length - 3)) : null)));
    }
  }
  return box;
}

function legend(store, data, refresh) {
  return el('div', { class: 'cal-legend' },
    data.categories.map((c) => {
      const dot = el('span', { class: 'cal-dot' });
      dot.style.background = c.color;
      return el('span', { class: 'cal-leg', style: '--c:' + c.color }, dot, c.label);
    }),
    data.can_edit_categories
      ? el('button', { type: 'button', class: 'btn ghost sm cal-leg-edit', onclick: () => openCategories(store, data, refresh) }, icon('palette'), '분야 고치기')
      : null);
}

// ---------- 들어가는 문 ----------
let paintSeq = 0;
export async function renderCalendar(root, store) {
  const seq = ++paintSeq;
  const refresh = () => renderCalendar(root, store);
  root.replaceChildren(el('div', { class: 'card' }, head(loaded, store, refresh), el('p', { class: 'lead-muted' }, '불러오는 중')));

  let data;
  try {
    data = await store.month(cursor);
  } catch (e) {
    if (seq !== paintSeq) return;
    root.replaceChildren(el('div', { class: 'card' }, head(loaded, store, refresh), el('p', { class: 'sec-empty' }, e.message)));
    return;
  }
  if (seq !== paintSeq) return; // 그리는 사이에 다른 요청이 시작됐다
  if (data.month !== cursor) return; // 그 사이 달을 넘겼다
  loaded = data;
  if (viewerOnly(data)) editing = false;

  root.replaceChildren(el('div', { class: 'card' },
    head(data, store, refresh),
    data.covered ? null : el('p', { class: 'cal-warn' }, icon('alert'), '이 해는 공휴일 목록(assets/holidays.js)에 없습니다. 주말만 보고 그렸습니다.'),
    grid(store, data, refresh),
    legend(store, data, refresh)));
}

export const calendarMonth = () => cursor;

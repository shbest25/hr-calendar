// 서랍 폼 두 개: 일정 추가·고치기, 분야 고치기.
import { el } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, field, iconButton, openDrawer } from './ui.js';
import { REPEAT_LABEL, HOLIDAY_LABEL, DOW_LABEL, ETC, PALETTE, nextKey } from './model.js';

const options = (pairs, chosen) => pairs.map(([value, label]) => {
  const node = el('option', { value }, label);
  node.selected = String(value) === String(chosen);
  return node;
});
const select = (label, pairs, chosen) => el('select', { 'aria-label': label }, options(pairs, chosen));
const text = (value, attrs = {}) => el('input', { type: 'text', value: value ?? '', ...attrs });
const date = (value) => el('input', { type: 'date', value: value ?? '' });

// 일정 추가·고치기. item 이 없으면 추가, 있으면 고치기. start 는 '이 날에 추가' 로 열었을 때의 날짜.
export function calendarForm({ heading, item = null, start = '', categories, onSave, onDelete = null }) {
  const v = {
    title: item?.title ?? '',
    category: item?.category ?? ETC,
    repeat_kind: item?.repeat_kind ?? 'none',
    on_weekday: item?.on_weekday ?? 1,
    on_day: item?.on_day ?? (start ? Number(start.slice(8, 10)) : 1),
    on_month: item?.on_month ?? 1,
    start_date: item?.start_date ?? start,
    end_date: item?.end_date ?? '',
    holiday_rule: item?.holiday_rule ?? 'keep',
    lead: item?.lead ?? '',
    deputy: item?.deputy ?? '',
    note: item?.note ?? '',
  };

  const title = text(v.title, { maxlength: '100', placeholder: '예) 정기급여 품의', required: true });
  const category = select('분야', categories.map((c) => [c.key, c.label]), v.category);
  const repeat = select('주기', Object.entries(REPEAT_LABEL), v.repeat_kind);
  const weekday = select('요일', DOW_LABEL.map((d, i) => [i, d + '요일']), v.on_weekday);
  const day = select('날짜', [...Array(31)].map((_, i) => [i + 1, (i + 1) + '일']), v.on_day);
  const month = select('월', [...Array(12)].map((_, i) => [i + 1, (i + 1) + '월']), v.on_month);
  const startDate = date(v.start_date);
  const endDate = date(v.end_date);
  const holiday = select('기한이 휴일이면', Object.entries(HOLIDAY_LABEL), v.holiday_rule);
  const lead = text(v.lead, { maxlength: '40', placeholder: '이름' });
  const deputy = text(v.deputy, { maxlength: '40', placeholder: '이름(선택)' });
  const note = el('textarea', { rows: '3', maxlength: '1000', placeholder: '메모(선택)' }, v.note);

  // 고른 주기에 필요한 칸만 보여 준다.
  const detail = el('div', { class: 'row' }, weekday, day, month);
  const startField = field('시작일', startDate, '한 번만 하는 일정은 이 날짜 하루만 뜹니다. 반복 일정은 이 날부터 시작합니다(비우면 처음부터).');
  const syncDetail = () => {
    const kind = repeat.value;
    weekday.hidden = kind !== 'weekly';
    day.hidden = !['monthly', 'quarterly', 'yearly'].includes(kind);
    month.hidden = kind !== 'yearly';
    detail.hidden = ['none', 'daily', 'workday', 'month_end'].includes(kind);
    startField.querySelector('.f-label').textContent = kind === 'none' ? '날짜' : '시작일';
  };
  repeat.addEventListener('change', syncDetail);
  syncDetail();

  const error = el('p', { class: 'form-error', hidden: true });
  const form = el('form', { id: 'cal-form', novalidate: true },
    error,
    field('이름', title),
    field('분야', category, '달력에서 이 분야의 색으로 보입니다.'),
    field('주기', el('div', { class: 'cal-repeat' }, repeat, detail)),
    startField,
    field('종료일', endDate, '비워 두면 끝없이 반복합니다.'),
    field('기한이 휴일이면', holiday, '토·일과 공휴일을 피해 옮깁니다.'),
    el('div', { class: 'row' }, field('담당 (정)', lead), field('담당 (부)', deputy)),
    field('메모', note));

  const read = () => ({
    title: title.value, category: category.value, repeat_kind: repeat.value,
    on_weekday: Number(weekday.value), on_day: Number(day.value), on_month: Number(month.value),
    start_date: startDate.value, end_date: endDate.value, holiday_rule: holiday.value,
    lead: lead.value, deputy: deputy.value, note: note.value,
  });

  const saveBtn = el('button', { type: 'submit', form: 'cal-form', class: 'btn primary' }, icon('check'), '저장');
  const cancelBtn = el('button', { type: 'button', class: 'btn ghost', onclick: () => ctl.close() }, '취소');
  const deleteBtn = onDelete
    ? el('button', {
      type: 'button', class: 'btn danger',
      onclick: async () => {
        const ok = await confirmBox({ title: `'${v.title}' 을(를) 지울까요?`, message: '반복 일정이면 모든 회차가 함께 사라집니다. 되돌릴 수 없습니다.', confirm: '지우기', danger: true });
        if (!ok) return;
        try { await onDelete(); ctl.close(); } catch (e) { showError(e); }
      },
    }, icon('trash'), '지우기')
    : null;

  const showError = (e) => { error.textContent = e.message || String(e); error.hidden = false; form.scrollIntoView({ block: 'start' }); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    saveBtn.disabled = true;
    try {
      await onSave(read());
      ctl.close();
    } catch (err) {
      showError(err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  const ctl = openDrawer({
    title: heading,
    lead: chip(icon('calendar')),
    body: form,
    footer: el('div', { class: 'd-foot-row', style: 'display:flex;gap:8px;width:100%;align-items:center' }, deleteBtn, el('span', { class: 'spacer' }), cancelBtn, saveBtn),
  });
  title.focus();
  return ctl;
}

// 분야 고치기. 목록은 함께 쓰는 것이라 통째로 보고 통째로 저장한다.
export function categoryDrawer({ categories, inUse = [], onSave }) {
  const used = new Set(inUse);
  let rows = categories.map((c) => ({ ...c }));
  const list = el('div', { class: 'cat-list' });
  const error = el('p', { class: 'form-error', hidden: true });

  const draw = () => {
    list.replaceChildren(...rows.map((row, at) => {
      const locked = row.key === ETC;
      const inuse = used.has(row.key);
      const dot = el('span', { class: 'cal-dot' });
      dot.style.background = row.color;
      const label = text(row.label, { maxlength: '12', 'aria-label': '분야 이름' });
      label.addEventListener('input', () => { row.label = label.value; });
      const color = el('input', { type: 'color', value: row.color, 'aria-label': row.label + ' 색' });
      color.addEventListener('input', () => { row.color = color.value.toUpperCase(); dot.style.background = row.color; });
      const why = locked ? "'기타' 는 뺄 수 없습니다(분야를 고르지 않은 일정이 가는 자리입니다)"
        : inuse ? '이 분야를 쓰는 일정이 있어 뺄 수 없습니다' : '이 분야 빼기';
      const move = (to) => { if (to < 0 || to >= rows.length) return; const [m] = rows.splice(at, 1); rows.splice(to, 0, m); draw(); };
      return el('div', { class: 'cat-row', 'data-key': row.key },
        dot, label, color,
        inuse && !locked ? el('span', { class: 'cat-tag' }, '쓰는 중') : null,
        iconButton('up', '위로', () => move(at - 1), at === 0),
        iconButton('down', '아래로', () => move(at + 1), at === rows.length - 1),
        iconButton('trash', why, () => { rows = rows.filter((r) => r !== row); draw(); }, locked || inuse));
    }));
  };
  draw();

  const add = el('button', {
    type: 'button', class: 'btn ghost',
    onclick: () => {
      const key = nextKey(new Set(rows.map((r) => r.key)));
      const at = rows.findIndex((r) => r.key === ETC); // 새 줄은 '기타' 바로 위에
      rows.splice(at < 0 ? rows.length : at, 0, { key, label: '새 분야', color: PALETTE[rows.length % PALETTE.length] });
      draw();
      list.querySelector(`[data-key="${key}"] input[type="text"]`)?.select();
    },
  }, icon('plus'), '분야 추가');

  const saveBtn = el('button', { type: 'button', class: 'btn primary' }, icon('check'), '저장');
  saveBtn.addEventListener('click', async () => {
    error.hidden = true;
    saveBtn.disabled = true;
    try {
      await onSave(rows.map(({ key, label, color }) => ({ key, label, color })));
      ctl.close();
    } catch (e) {
      error.textContent = e.message || String(e);
      error.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });

  const ctl = openDrawer({
    title: '업무 분야 고치기',
    lead: chip(icon('palette')),
    body: el('div', {},
      el('p', { class: 'lead-muted', style: 'margin-bottom:12px' }, "달력의 색과 이름입니다. 순서는 화살표로 바꿉니다. 지금 일정이 쓰고 있는 분야와 '기타' 는 뺄 수 없습니다."),
      error, list, el('div', { class: 'set-add' }, add)),
    footer: el('div', { style: 'display:flex;gap:8px;width:100%;justify-content:flex-end' },
      el('button', { type: 'button', class: 'btn ghost', onclick: () => ctl.close() }, '취소'), saveBtn),
  });
  return ctl;
}

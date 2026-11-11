// 직원명부. 장기근속 케어 메일(입사일)·재직/경력증명서(소속·입사일·퇴사일)·신규 입사자의 명부 등재가 모두 여기를 쓴다.
// 주민등록번호·급여 같은 민감한 값은 두지 않는다 — 증명서에 필요하면 그때 손으로 적는다.
import { el, replace } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, field, iconButton, openDrawer, selectBox, toast } from './ui.js';
import { DATE, dday, todayYmd } from './autotext.js';

export const STAFF_FIELDS = [
  ['name', '이름'], ['emp_no', '사번'], ['dept', '부서'], ['team', '팀'], ['part', '파트'], ['job_group', '직군'], ['job', '직무'],
  ['title', '직책'], ['joined', '입사일'], ['left', '퇴사일'], ['email', '회사 이메일'], ['phone', '연락처'], ['employ_type', '고용형태'],
];

let query = '';
let showLeft = false;

const fullDept = (s) => [s.dept, s.team, s.part].filter(Boolean).join(' ');

// 근속 햇수(소수 한 자리). 퇴사자는 퇴사일까지.
export function tenure(s, today = todayYmd()) {
  if (!DATE.test(s.joined ?? '')) return '';
  const end = s.left && DATE.test(s.left) ? s.left : today;
  const days = (new Date(end + 'T00:00:00') - new Date(s.joined + 'T00:00:00')) / 86400000;
  return days < 0 ? '' : (days / 365.25).toFixed(1) + '년';
}

function editDrawer(ctx, row, refresh) {
  const d = { ...(row?.data ?? {}) };
  const text = (key, attrs = {}) => {
    const node = el('input', { type: 'text', autocomplete: 'off', ...attrs });
    node.value = d[key] ?? '';
    node.addEventListener('input', () => { d[key] = node.value; });
    return node;
  };
  const error = el('p', { class: 'form-error', hidden: true });
  const form = el('form', { novalidate: true, onsubmit: (e) => e.preventDefault() },
    error,
    el('div', { class: 'row' }, field('이름 *', text('name', { required: true })), field('사번', text('emp_no'))),
    el('div', { class: 'row' }, field('부서', text('dept')), field('팀', text('team')), field('파트', text('part'))),
    el('div', { class: 'row' }, field('직군', text('job_group')), field('직무', text('job')), field('직책', text('title'))),
    el('div', { class: 'row' }, field('입사일 *', text('joined', { type: 'date' })), field('퇴사일', text('left', { type: 'date' }), '비우면 재직 중')),
    el('div', { class: 'row' }, field('회사 이메일', text('email', { type: 'email' }), '장기근속 메일이 이 주소로 갑니다.'), field('연락처', text('phone'))),
    el('div', { class: 'row' }, field('고용형태', text('employ_type', { placeholder: '정규 / 계약' })), field('메모', text('note'))));
  const saveBtn = el('button', { type: 'button', class: 'btn primary' }, icon('check'), '저장');
  saveBtn.addEventListener('click', async () => {
    error.hidden = true;
    if (!String(d.name ?? '').trim()) { error.textContent = '이름을 적어 주세요.'; error.hidden = false; return; }
    if (!DATE.test(d.joined ?? '')) { error.textContent = '입사일을 골라 주세요.'; error.hidden = false; return; }
    if (d.left && d.left < d.joined) { error.textContent = '퇴사일이 입사일보다 앞설 수 없습니다.'; error.hidden = false; return; }
    saveBtn.disabled = true;
    try { await ctx.store.saveRecord('staff', row?.id ?? null, d); toast('저장했습니다'); ctl.close(); refresh(); } catch (e) { error.textContent = e.message; error.hidden = false; } finally { saveBtn.disabled = false; }
  });
  const ctl = openDrawer({
    title: row ? '직원 고치기' : '직원 추가',
    lead: chip(icon('people')),
    body: form,
    footer: el('div', { style: 'display:flex;gap:8px;width:100%;align-items:center' },
      row ? el('button', { type: 'button', class: 'btn danger', onclick: async () => {
        const ok = await confirmBox({ title: `'${d.name}' 을(를) 명부에서 지울까요?`, message: '되돌릴 수 없습니다. 퇴사자는 지우지 말고 퇴사일을 적어 두는 편이 낫습니다(경력증명서에 필요).', confirm: '지우기', danger: true });
        if (!ok) return;
        try { await ctx.store.deleteRecord(row.id); toast('지웠습니다'); ctl.close(); refresh(); } catch (e) { toast(e.message, { error: true }); }
      } }, icon('trash'), '지우기') : null,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => ctl.close() }, '취소'), saveBtn),
  });
}

// 붙여 넣기로 여러 명을 한 번에. 첫 줄은 머리글(이름·사번·부서·…), 칸은 탭 또는 쉼표.
function importDrawer(ctx, existing, refresh) {
  const box = el('textarea', { rows: '10', placeholder: '이름\t사번\t부서\t팀\t직군\t직무\t입사일\t퇴사일\t회사 이메일\n홍길동\tE1001\t경영지원실\t인사팀\t경영/사업\t인사 담당\t2020-03-02\t\tgildong@example.com', spellcheck: 'false', class: 'mono' });
  const info = el('p', { class: 'lead-muted' }, '엑셀·구글 시트에서 범위를 복사해 붙여 넣으면 됩니다. 머리글 이름으로 칸을 맞춥니다(이름·사번·부서·팀·파트·직군·직무·직책·입사일·퇴사일·이메일·연락처·고용형태).');
  const preview = el('div', {});
  const LABEL_TO_KEY = Object.fromEntries(STAFF_FIELDS.map(([k, l]) => [l.replace(/\s/g, ''), k]));
  LABEL_TO_KEY['이메일'] = 'email'; LABEL_TO_KEY['메일'] = 'email'; LABEL_TO_KEY['소속'] = 'dept'; LABEL_TO_KEY['성명'] = 'name'; LABEL_TO_KEY['입사일자'] = 'joined'; LABEL_TO_KEY['퇴사일자'] = 'left';
  const normDate = (v) => {
    const t = String(v ?? '').trim().replace(/[./]/g, '-');
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : (t ? null : '');
  };
  let parsed = [];
  const parse = () => {
    const lines = box.value.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { parsed = []; preview.replaceChildren(); return; }
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const heads = lines[0].split(sep).map((h) => LABEL_TO_KEY[h.trim().replace(/\s/g, '')] ?? null);
    const bad = [];
    parsed = lines.slice(1).map((line, i) => {
      const cells = line.split(sep);
      const row = {};
      heads.forEach((k, at) => { if (k) row[k] = String(cells[at] ?? '').trim(); });
      row.joined = normDate(row.joined);
      row.left = normDate(row.left);
      if (!row.name || row.joined === null || row.joined === '' || row.left === null) bad.push(i + 2);
      return row;
    }).filter((r) => r.name && r.joined && r.left !== null);
    const dup = parsed.filter((r) => r.emp_no && existing.some((e) => e.data.emp_no === r.emp_no));
    replace(preview,
      el('p', { class: 'lead-muted' }, `읽은 사람 ${parsed.length}명` + (bad.length ? ` · 건너뛴 줄 ${bad.length}개(${bad.slice(0, 5).join(', ')}행 — 이름 또는 입사일이 비었거나 날짜 꼴이 아님)` : '') + (dup.length ? ` · 같은 사번이 이미 있는 사람 ${dup.length}명은 건너뜁니다` : '')),
      heads.every((h) => !h) ? el('p', { class: 'form-error' }, '머리글에서 아는 이름을 찾지 못했습니다. 첫 줄이 이름·사번·부서… 같은 머리글인지 확인해 주세요.') : null);
    parsed = parsed.filter((r) => !(r.emp_no && existing.some((e) => e.data.emp_no === r.emp_no)));
  };
  box.addEventListener('input', parse);
  const saveBtn = el('button', { type: 'button', class: 'btn primary' }, icon('check'), '가져오기');
  saveBtn.addEventListener('click', async () => {
    parse();
    if (!parsed.length) { toast('가져올 사람이 없습니다.', { error: true }); return; }
    saveBtn.disabled = true;
    let n = 0;
    try {
      for (const r of parsed) { await ctx.store.saveRecord('staff', null, r); n += 1; }
      toast(`${n}명을 명부에 넣었습니다`);
      ctl.close();
      refresh();
    } catch (e) {
      toast(`${n}명까지 넣고 멈췄습니다: ${e.message}`, { error: true });
    } finally { saveBtn.disabled = false; }
  });
  const ctl = openDrawer({
    title: '직원명부 가져오기',
    lead: chip(icon('people')),
    wide: true,
    body: el('div', {}, info, box, preview),
    footer: el('div', { style: 'display:flex;gap:8px;width:100%;justify-content:flex-end' }, el('button', { type: 'button', class: 'btn ghost', onclick: () => ctl.close() }, '취소'), saveBtn),
  });
}

function exportCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [STAFF_FIELDS.map(([, l]) => esc(l)).join(','), ...rows.map((r) => STAFF_FIELDS.map(([k]) => esc(r.data[k])).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `직원명부_${todayYmd()}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export async function renderStaff(root, ctx) {
  const refresh = () => renderStaff(root, ctx);
  const header = (rows) => el('div', { class: 'cal-head' },
    chip(icon('people')),
    el('h2', {}, '직원명부'),
    el('div', { class: 'cal-tools' },
      rows?.length ? el('button', { type: 'button', class: 'btn ghost', onclick: () => exportCsv(rows) }, icon('download'), 'CSV 내보내기') : null,
      ctx.canEdit ? el('button', { type: 'button', class: 'btn ghost', onclick: () => importDrawer(ctx, rows ?? [], refresh) }, icon('copy'), '붙여 넣어 가져오기') : null,
      ctx.canEdit ? el('button', { type: 'button', class: 'btn primary', onclick: () => editDrawer(ctx, null, refresh) }, icon('plus'), '직원 추가') : null));
  root.replaceChildren(el('div', { class: 'card' }, header(null), el('p', { class: 'lead-muted' }, '불러오는 중')));
  let rows;
  try { rows = await ctx.store.records('staff'); } catch (e) {
    root.replaceChildren(el('div', { class: 'card' }, header(null), el('p', { class: 'sec-empty' }, e.message)));
    return;
  }
  rows.sort((a, b) => String(a.data.name).localeCompare(String(b.data.name), 'ko'));

  const search = el('input', { type: 'search', class: 'hire-search', placeholder: '이름·사번·소속으로 찾기', 'aria-label': '찾기', value: query, autocomplete: 'off' });
  const leftBox = el('input', { type: 'checkbox', checked: showLeft });
  const body = el('div', {});
  const paint = () => {
    const q = query.trim();
    const list = rows.filter((r) => showLeft || !r.data.left).filter((r) => !q || `${r.data.name} ${r.data.emp_no} ${fullDept(r.data)} ${r.data.job}`.includes(q));
    body.replaceChildren(
      el('p', { class: 'lead-muted', style: 'margin:0 0 10px' }, `재직 ${rows.filter((r) => !r.data.left).length}명 · 퇴사 ${rows.filter((r) => r.data.left).length}명` + (q ? ` · 찾은 사람 ${list.length}명` : '')),
      list.length ? el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ['이름', '사번', '소속', '직군 / 직무', '직책', '입사일', '근속', '회사 이메일', ''].map((h) => el('th', {}, h)))),
        el('tbody', {}, list.map((r) => {
          const s = r.data;
          return el('tr', { class: s.left ? 'off' : '' },
            el('td', {}, el('b', {}, s.name), s.left ? el('small', { class: 'tag-off' }, `퇴사 ${s.left}`) : null),
            el('td', {}, s.emp_no || '-'), el('td', {}, fullDept(s) || '-'), el('td', {}, [s.job_group, s.job].filter(Boolean).join(' / ') || '-'),
            el('td', {}, s.title || '-'), el('td', {}, s.joined || '-'), el('td', {}, tenure(s)), el('td', {}, s.email || '-'),
            el('td', {}, ctx.canEdit ? iconButton('edit', '고치기', () => editDrawer(ctx, r, refresh)) : null));
        }))))
        : el('p', { class: 'sec-empty' }, rows.length ? '맞는 사람이 없습니다.' : '아직 직원이 없습니다. [직원 추가] 또는 [붙여 넣어 가져오기]로 시작하세요.'));
  };
  search.addEventListener('input', () => { query = search.value; paint(); });
  leftBox.addEventListener('change', () => { showLeft = leftBox.checked; paint(); });
  paint();
  root.replaceChildren(el('div', { class: 'card' },
    header(rows),
    el('div', { class: 'hire-bar' }, search, el('label', { class: 'check' }, leftBox, el('span', {}, '퇴사자도 보기')),
      el('p', { class: 'hire-notice' }, icon('info'), '장기근속 메일·재직증명서·명부 등재가 이 명부를 씁니다. 주민번호·급여는 두지 않습니다.')),
    body));
}

// 신규 입사자 화면. 일은 순서대로 흐른다 — 입사 확정 → 명부 등재 → 끝남.
// 사람을 열면 '할 일'(입사일 일정·부서 공지·인사팀 공지·안내 메일·직원명부 등재) 중 필요한 것만 골라 실행한다.
// 서버가 없으므로: 일정은 이 달력에 바로 만들고, 공지는 슬랙 Webhook 이 있으면 올리고 없으면 복사하며, 메일은 메일 앱을 연다.
import { el, append, replace } from './dom.js';
import { icon } from './icons.js';
import { bubble, chip, confirmBox, copyText, field, iconButton, openDrawer, selectBox, toast } from './ui.js';
import {
  HIRE_STAGES, HIRE_SORTS, sortHires, dday, formatPhone, hireValues, fill, missingKeys, mailtoUrl, postSlack, stamp, todayYmd,
} from './autotext.js';

const HINT = {
  register: '입사가 확정되어 정보를 받아 둔 사람입니다. 할 일에서 입사일 일정을 만들면 저절로 명부 등재로 넘어갑니다.',
  enroll: '사번을 적고 [명부 등재 완료]를 누르면 직원명부에 올리고 저절로 끝남으로 넘어갑니다.',
  done: '할 일이 끝난 사람입니다.',
};
const NEXT_LABEL = { register: '명부 등재로', enroll: '끝내기' };
const TASK_LABEL = { calendar: '일정', 'slack:dept': '부서 공지', 'slack:hr': '인사팀 공지', mail: '메일', staff: '명부' };
const OWN = '__own__';

let tab = null;
let query = '';
let sort = 'start_desc';

const stamp2 = (iso) => stamp(iso);
const who = (ctx) => ctx.me?.email || ctx.me?.name || '';

// 이 사람이 할 수 있는 일. done 은 results 로 안다.
export function taskList(data, settings) {
  const h = settings.hire;
  const r = data.results ?? {};
  const done = (id) => r[id]?.status === 'ok';
  return [
    { id: 'calendar', stage: 1, label: '입사일 일정 만들기', where: data.start_date ? `${data.start_date} 하루 종일 · 캘린더 '입·퇴사' 분야` : '', blocked: data.start_date ? '' : '입사일이 없습니다', done: done('calendar') },
    { id: 'slack:dept', stage: 1, label: '부서 공지', where: '아래에 적은 채널 또는 사람', blocked: h.slack_notice ? '' : '설정에 부서 공지 문구가 없습니다', done: done('slack:dept') },
    { id: 'slack:hr', stage: 1, label: '인사팀 공지', where: h.hr_channel || '', blocked: h.slack_hr_notice ? '' : '설정에 인사팀 공지 문구가 없습니다', done: done('slack:hr') },
    { id: 'mail', stage: 1, label: '안내 메일', where: data.email || '', blocked: data.email ? '' : '개인이메일이 없습니다', done: done('mail') },
    { id: 'staff', stage: 2, label: '직원명부에 올리기', where: data.emp_no ? `사번 ${data.emp_no}` : '', blocked: data.emp_no ? '' : '사번을 적어야 합니다', done: done('staff') },
  ];
}

function defaultPicked(tasks, stage) {
  const left = tasks.filter((t) => !t.done && !t.blocked);
  if (stage !== 'register') return new Set(left.filter((t) => t.stage === 2).map((t) => t.id));
  return new Set(left.filter((t) => t.stage === 1).map((t) => t.id));
}

// ---------- 목록 ----------
function head(ctx, refresh) {
  return el('div', { class: 'cal-head' },
    chip(icon('user-add')),
    el('h2', {}, '신규 입사자'),
    el('div', { class: 'cal-tools' },
      ctx.canEdit ? el('button', { type: 'button', class: 'btn ghost', onclick: () => ctx.openSettings('hire', refresh) }, icon('edit'), '설정') : null,
      ctx.canEdit ? el('button', { type: 'button', class: 'btn primary', onclick: () => openHire(ctx, null, refresh) }, icon('plus'), '입사자 등록') : null));
}

function pips(data, settings) {
  const tasks = taskList(data, settings);
  const r = data.results ?? {};
  return el('div', { class: 'hire-pips' }, tasks.map((t) => {
    const st = r[t.id]?.status;
    const cls = st === 'ok' ? 'ok' : st === 'failed' ? 'bad' : 'todo';
    const word = st === 'ok' ? '됨' : st === 'failed' ? '실패' : '아직 안 함';
    return el('span', { class: 'hire-pip ' + cls, title: `${TASK_LABEL[t.id]} ${word}` }, TASK_LABEL[t.id]);
  }));
}

async function advance(ctx, row, stage, refresh) {
  const label = stage === 'enroll' ? '명부 등재' : '끝남';
  const ok = await confirmBox({ title: `${row.data.name} 님을 '${label}' 으로 넘길까요?`, message: '할 일을 하지 않고 단계만 바꿉니다(다른 곳에서 이미 처리한 경우).', confirm: '넘기기' });
  if (!ok) return;
  const data = { ...row.data, stage, log: [{ at: new Date().toISOString(), by: who(ctx), text: `단계 넘김: ${label}(손으로)` }, ...(row.data.log ?? [])] };
  try { await ctx.store.saveRecord('hire', row.id, data); toast(`${label} 으로 넘겼습니다`); refresh(); } catch (e) { toast(e.message, { error: true }); }
}

function rowNode(row, ctx, settings, refresh) {
  const d = row.data;
  const when = dday(d.start_date);
  const next = NEXT_LABEL[d.stage];
  return el('div', { class: 'hire-row' },
    el('div', { class: 'hire-date' + (when.includes('지남') ? ' past' : '') },
      el('span', { class: 'hire-date-day' }, d.start_date ? `${Number(d.start_date.slice(5, 7))}/${Number(d.start_date.slice(8, 10))}` : '—'),
      el('span', { class: 'hire-date-left' }, when || '입사일 없음')),
    el('div', { class: 'hire-who' },
      el('span', { class: 'hire-name' }, d.name || '이름 없음'),
      el('span', { class: 'hire-dept' }, [d.dept, d.team, d.part].filter(Boolean).join(' ') || '소속 없음', d.job ? ` · ${d.job}` : '')),
    pips(d, settings),
    ctx.canEdit ? el('div', { class: 'hire-acts' },
      d.stage === 'enroll' ? el('button', { type: 'button', class: 'btn primary sm', onclick: () => openHire(ctx, row, refresh) }, '명부 등재하기') : null,
      next ? el('button', { type: 'button', class: 'btn ghost sm', onclick: () => advance(ctx, row, d.stage === 'register' ? 'enroll' : 'done', refresh) }, next) : null,
      iconButton('edit', '열기', () => openHire(ctx, row, refresh)),
      iconButton('trash', '지우기', async () => {
        const ok = await confirmBox({ title: `'${d.name}' 을(를) 지울까요?`, message: '처리 내역도 함께 사라집니다. 이미 만든 일정·명부는 남습니다.', confirm: '지우기', danger: true });
        if (!ok) return;
        try { await ctx.store.deleteRecord(row.id); toast('지웠습니다'); refresh(); } catch (e) { toast(e.message, { error: true }); }
      })) : el('div', { class: 'hire-acts' }, iconButton('edit', '보기', () => openHire(ctx, row, refresh))));
}

export async function renderHire(root, ctx) {
  const refresh = () => renderHire(root, ctx);
  root.replaceChildren(el('div', { class: 'card' }, head(ctx, refresh), el('p', { class: 'lead-muted' }, '불러오는 중')));
  let rows;
  let settings;
  try {
    [rows, settings] = await Promise.all([ctx.store.records('hire'), ctx.settings()]);
  } catch (e) {
    root.replaceChildren(el('div', { class: 'card' }, head(ctx, refresh), el('p', { class: 'sec-empty' }, e.message)));
    return;
  }
  if (!tab) tab = (HIRE_STAGES.find((s) => rows.some((r) => r.data.stage === s.key)) ?? HIRE_STAGES[0]).key;

  const search = el('input', { type: 'search', class: 'hire-search', placeholder: '이름·소속으로 찾기', 'aria-label': '이름·소속으로 찾기', autocomplete: 'off', value: query });
  const sorter = selectBox('정렬', Object.entries(HIRE_SORTS), sort, { class: 'hire-sort' });
  const body = el('div', {});
  const paint = () => {
    const stage = HIRE_STAGES.find((s) => s.key === tab) ?? HIRE_STAGES[0];
    const q = query.trim();
    const list = sortHires(rows.filter((r) => r.data.stage === stage.key).filter((r) => !q || `${r.data.name} ${r.data.dept} ${r.data.team}`.includes(q)), sort);
    body.replaceChildren(
      el('div', { class: 'hire-steps', role: 'tablist' }, HIRE_STAGES.flatMap((s, i) => {
        const btn = el('button', { type: 'button', role: 'tab', class: 'hire-step', 'aria-selected': String(tab === s.key), onclick: () => { tab = s.key; paint(); } },
          el('span', { class: 'hire-step-name' }, s.title), el('span', { class: 'hire-step-count' }, String(rows.filter((r) => r.data.stage === s.key).length)));
        return i < HIRE_STAGES.length - 1 ? [btn, el('span', { class: 'hire-step-arrow', 'aria-hidden': 'true' }, icon('right'))] : [btn];
      })),
      el('p', { class: 'lead-muted', style: 'margin:10px 0 12px' }, HINT[stage.key]),
      list.length
        ? el('div', { class: 'hire-list' }, list.map((r) => rowNode(r, ctx, settings, refresh)))
        : el('div', { class: 'sec-empty' }, q ? `'${q}' 에 맞는 사람이 없습니다.` : stage.empty));
  };
  search.addEventListener('input', () => { query = search.value; paint(); });
  sorter.addEventListener('change', () => { sort = sorter.value; paint(); });
  paint();

  root.replaceChildren(el('div', { class: 'card' },
    head(ctx, refresh),
    el('div', { class: 'hire-bar' }, search, sorter,
      el('p', { class: 'hire-notice' }, icon('info'), "사람을 열면 '할 일'에서 일정·공지·메일 중 필요한 것만 골라 실행합니다.")),
    body));
}

// ---------- 서랍: 등록·고치기·할 일 ----------
const own = (list, value) => (value && !list.includes(value) ? OWN : value);

export async function openHire(ctx, row, refresh) {
  let settings;
  try { settings = await ctx.settings(); } catch (e) { toast(e.message, { error: true }); return; }
  const h = settings.hire;
  const isNew = !row;
  const d = { stage: 'register', results: {}, log: [], ...(row?.data ?? {}) };
  const id = row?.id ?? null;
  const readOnly = !ctx.canEdit;

  // ---- 입력 칸 ----
  const text = (key, attrs = {}) => {
    const node = el('input', { type: 'text', autocomplete: 'off', disabled: readOnly, ...attrs });
    node.value = d[key] ?? '';
    node.addEventListener('input', () => { d[key] = node.value; changed(); });
    return node;
  };
  const pick = (key, list, label) => {
    const sel = selectBox(label, [['', '고르세요'], ...list.map((x) => [x, x]), [OWN, '직접 적기']], own(list, d[key]), { disabled: readOnly });
    const free = el('input', { type: 'text', placeholder: '직접 적어 주세요', hidden: sel.value !== OWN, disabled: readOnly });
    free.value = list.includes(d[key]) ? '' : (d[key] ?? '');
    sel.addEventListener('change', () => { free.hidden = sel.value !== OWN; d[key] = sel.value === OWN ? free.value : sel.value; if (sel.value === OWN) free.focus(); changed(); });
    free.addEventListener('input', () => { d[key] = free.value; changed(); });
    return el('div', { class: 'pick' }, sel, free);
  };
  const name = text('name', { required: true, placeholder: '홍길동' });
  const gender = selectBox('성별', [['', '고르세요'], ['남자', '남자'], ['여자', '여자']], d.gender, { disabled: readOnly });
  gender.addEventListener('change', () => { d.gender = gender.value; changed(); });
  const start = el('input', { type: 'date', disabled: readOnly, value: d.start_date ?? '' });
  start.addEventListener('input', () => { d.start_date = start.value; changed(); });
  const phone = text('phone', { placeholder: '010-0000-0000', inputmode: 'numeric' });
  phone.addEventListener('input', () => { const at = phone.selectionStart; phone.value = formatPhone(phone.value); d.phone = phone.value; if (at != null) phone.setSelectionRange(phone.value.length, phone.value.length); });
  const route = selectBox('지원경로', [['', '고르세요'], ...(h.routes ?? []).map((x) => [x, x])], d.route, { disabled: readOnly });
  const referrerField = field('추천인', text('referrer'));
  const syncReferrer = () => { referrerField.hidden = route.value !== '사내인재추천'; };
  route.addEventListener('change', () => { d.route = route.value; syncReferrer(); changed(); });
  syncReferrer();
  const employ = selectBox('고용형태', [['', '고르세요'], ...(h.employ_types ?? []).map((x) => [x, x])], d.employ_type, { disabled: readOnly });
  employ.addEventListener('change', () => { d.employ_type = employ.value; changed(); });

  const REQUIRED = [['name', '이름'], ['start_date', '입사일'], ['dept', '부서'], ['job_group', '직군'], ['job', '직무'], ['employ_type', '고용형태'], ['email', '개인이메일']];
  const missing = () => REQUIRED.filter(([k]) => !String(d[k] ?? '').trim()).map(([, l]) => l);

  // ---- 미리보기(문구) ----
  const pv = el('div', { class: 'hire-preview' });
  const drawPreview = () => {
    const v = hireValues(d, settings, { mention: '(멘션)' });
    const miss = missing();
    replace(pv,
      el('h4', {}, '미리보기'),
      el('div', { class: 'kv' }, el('span', {}, '메일 제목'), el('b', {}, fill(h.mail_subject, v))),
      el('div', { class: 'kv' }, el('span', {}, '일정 제목'), el('b', {}, fill(h.calendar_title, v))),
      el('div', { class: 'kv top' }, el('span', {}, '부서 공지'), bubble(fill(h.slack_notice, v), { slack: true })),
      miss.length ? el('p', { class: 'form-error' }, `필수 칸 ${miss.length}개가 비어 있습니다: ${miss.join(', ')}`) : null);
  };
  // 값을 고치면 문구 미리보기와 할 일(사번을 적으면 명부 등재가 열린다)을 다시 그린다.
  let previewTimer = 0;
  const changed = () => { clearTimeout(previewTimer); previewTimer = setTimeout(() => { drawPreview(); drawTasks(); }, 120); };
  drawPreview();

  const form = el('form', { class: 'hire-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    el('div', { class: 'row' }, field('이름 *', name), field('성별', gender)),
    el('div', { class: 'row' }, field('입사일 *', start), field('고용형태 *', employ)),
    el('div', { class: 'row' }, field('부서 *', pick('dept', h.depts ?? [], '부서')), field('팀', text('team', { placeholder: '예: 인사팀' }))),
    el('div', { class: 'row' }, field('파트', text('part', { placeholder: '없으면 비움' })), field('직군 *', pick('job_group', h.jobs ?? [], '직군'))),
    field('직무 *', text('job', { placeholder: '예: 시스템 기획자' })),
    el('div', { class: 'row' }, field('연락처', phone), field('개인이메일 *', text('email', { type: 'email', placeholder: 'name@example.com' }))),
    el('div', { class: 'row' }, field('지원경로', route), referrerField),
    el('div', { class: 'row' }, field('영문이름', text('eng_name', { placeholder: 'gildong.hong' }), '회사 계정·사원증에 쓰입니다.'), field('경력', text('career', { placeholder: '00년00개월' }))),
    d.stage !== 'register' || d.emp_no
      ? el('div', { class: 'row' }, field('사번', text('emp_no', { placeholder: '명부 등재 때 필요' })), field('회사 이메일', text('work_email', { type: 'email', placeholder: '명부에 적힙니다(선택)' })))
      : null,
    pv);

  // ---- 할 일 ----
  const taskBox = isNew ? null : el('section', { class: 'hire-sec' });
  // 담당자가 손으로 켜고 끈 것은 다시 그려도 그대로 둔다(끈 메일이 다시 켜지지 않게).
  const userOn = new Set();
  const userOff = new Set();
  const notice = { dest: d.notice_dest ?? '', mentions: d.notice_mentions ?? '' };
  function drawTasks() {
    if (!taskBox) return;
    const tasks = taskList(d, settings);
    const can = (id) => tasks.some((t) => t.id === id && !t.done && !t.blocked);
    const picked = new Set([...defaultPicked(tasks, d.stage), ...userOn].filter((id) => can(id) && !userOff.has(id)));
    const runBtn = el('button', { type: 'button', class: 'btn primary', disabled: readOnly }, icon('check'), '');
    const problem = el('p', { class: 'form-error', hidden: true });
    const enrolling = () => tasks.some((t) => t.stage === 2 && picked.has(t.id));
    const syncRun = () => {
      runBtn.lastChild.textContent = !picked.size ? '고른 일 실행' : enrolling() ? '명부 등재 완료' + (picked.size > 1 ? ` (고른 일 ${picked.size}개)` : '') : `고른 일 ${picked.size}개 실행`;
      runBtn.disabled = readOnly || !picked.size;
      problem.hidden = true;
    };
    const v = (mention) => hireValues(d, settings, { mention });
    const previewOf = (t) => {
      const box = el('details', { class: 'ht-pv' }, el('summary', {}, '미리보기'));
      const inner = el('div', {});
      box.append(inner);
      const draw = () => {
        if (t.id === 'calendar') inner.replaceChildren(el('div', { class: 'kv' }, el('span', {}, '제목'), el('b', {}, fill(h.calendar_title, v('')))), el('div', { class: 'kv' }, el('span', {}, '날짜'), el('b', {}, `${d.start_date} (하루 종일)`)));
        else if (t.id === 'slack:dept') inner.replaceChildren(bubble(fill(h.slack_notice, v(notice.mentions ? notice.mentions.split(/[\s,]+/).filter(Boolean).map((m) => (m.startsWith('@') ? m : '@' + m)).join(' ') : '')).replace(/^\s*님, /, ''), { slack: true }));
        else if (t.id === 'slack:hr') inner.replaceChildren(bubble(fill(h.slack_hr_notice, v('')), { slack: true }));
        else if (t.id === 'mail') inner.replaceChildren(el('div', { class: 'kv' }, el('span', {}, '받는 사람'), el('b', {}, d.email)), el('div', { class: 'kv' }, el('span', {}, '제목'), el('b', {}, fill(h.mail_subject, v('')))), bubble(fill(h.mail_text, v(''))));
        else if (t.id === 'staff') inner.replaceChildren(el('p', { class: 'lead-muted' }, `직원명부에 ${d.name}(사번 ${d.emp_no}) · ${[d.dept, d.team, d.part].filter(Boolean).join(' ')} · ${d.job} · 입사일 ${d.start_date} 로 올립니다.`));
      };
      draw();
      return { box, draw };
    };
    const redraws = [];
    const rows = tasks.map((t) => {
      const prior = d.results?.[t.id];
      const box = el('input', { type: 'checkbox', 'aria-label': t.label, checked: picked.has(t.id), disabled: readOnly || t.done || Boolean(t.blocked) });
      const li = el('li', { class: 'ht-task' + (t.done ? ' done' : '') + (t.blocked && !t.done ? ' blocked' : '') });
      box.addEventListener('change', () => {
        if (box.checked) { picked.add(t.id); userOn.add(t.id); userOff.delete(t.id); } else { picked.delete(t.id); userOff.add(t.id); userOn.delete(t.id); }
        li.classList.toggle('off', !box.checked && !t.done && !t.blocked);
        syncRun();
      });
      let extra = null;
      if (t.id === 'slack:dept' && !t.done && !t.blocked) {
        const dest = el('input', { type: 'text', placeholder: '#채널 또는 @이름', value: notice.dest, 'aria-label': '공지 대상', disabled: readOnly });
        const men = el('input', { type: 'text', placeholder: '@팀장 @파트장 (띄어쓰기로 여럿)', value: notice.mentions, 'aria-label': '멘션할 사람', disabled: readOnly });
        dest.addEventListener('input', () => { notice.dest = dest.value; problem.hidden = true; });
        men.addEventListener('input', () => { notice.mentions = men.value; redraws.forEach((f) => f()); });
        extra = el('div', { class: 'ht-slack' },
          el('div', { class: 'ht-slack-row' }, el('span', { class: 'ht-slack-k' }, '공지 대상'), dest),
          el('div', { class: 'ht-slack-row' }, el('span', { class: 'ht-slack-k' }, '멘션'), men));
      }
      const pvNode = t.done || t.blocked ? null : previewOf(t);
      if (pvNode) redraws.push(pvNode.draw);
      const again = t.done && (t.id === 'slack:dept' || t.id === 'slack:hr' || t.id === 'mail')
        ? iconButton(t.id === 'mail' ? 'mail' : 'copy', t.id === 'mail' ? '메일 앱 다시 열기' : '문구 다시 복사', async () => {
          if (t.id === 'mail') { location.href = mailtoUrl(d.email, fill(h.mail_subject, v('')), fill(h.mail_text, v(''))); return; }
          const txt = t.id === 'slack:dept' ? fill(h.slack_notice, v(prior?.mention || '')) : fill(h.slack_hr_notice, v(''));
          toast((await copyText(txt)) ? '복사했습니다' : '복사하지 못했습니다');
        })
        : null;
      append(li,
        el('label', { class: 'ht-line' }, box, el('span', { class: 'ht-name' }, t.label), t.where ? el('span', { class: 'ht-where' }, t.where) : null,
          t.done ? el('span', { class: 'ht-state ok' }, '됨' + (prior?.at ? ' · ' + stamp2(prior.at) : '')) : prior?.status === 'failed' ? el('span', { class: 'ht-state bad' }, '지난번 실패') : null,
          again),
        !t.done && t.blocked ? el('p', { class: 'ht-why' }, t.blocked) : null,
        !t.done && !t.blocked && prior?.status === 'failed' && prior.error ? el('p', { class: 'ht-why' }, prior.error) : null,
        extra,
        pvNode?.box ?? null);
      return li;
    });

    runBtn.addEventListener('click', async () => {
      const miss = missing();
      if (miss.length) { problem.textContent = `필수 칸이 비어 있습니다: ${miss.join(', ')}`; problem.hidden = false; return; }
      if (picked.has('slack:dept') && !notice.dest.trim()) { problem.textContent = '부서 공지를 어디로 보낼지(공지 대상)를 적어 주세요.'; problem.hidden = false; return; }
      const chosen = tasks.filter((t) => picked.has(t.id));
      const webhook = settings.company.slack_webhook;
      const warn = [...new Set(chosen.map((t) => {
        if (t.id === 'calendar') return '캘린더에 일정이 만들어집니다';
        if (t.id === 'mail') return '메일 앱이 열립니다';
        if (t.id === 'staff') return '직원명부에 한 줄이 생깁니다';
        return webhook ? '슬랙에 공지가 바로 올라갑니다' : '공지 문구가 복사됩니다';
      }))];
      const ok = await confirmBox({
        title: enrolling() ? '명부 등재를 완료할까요?' : `고른 일 ${chosen.length}개를 실행할까요?`,
        message: `${warn.join(', ')}.`,
        confirm: enrolling() ? '명부 등재 완료' : '실행',
        extra: el('ul', { class: 'ht-confirm' }, chosen.map((t) => el('li', {}, t.label, t.id === 'slack:dept' ? ` → ${notice.dest}` : '', t.id === 'slack:hr' ? ` → ${h.hr_channel}` : ''))),
      });
      if (!ok) return;
      runBtn.disabled = true;
      runBtn.lastChild.textContent = '실행하는 중…';
      await runTasks(chosen, notice);
    });

    syncRun();
    const runnable = tasks.some((t) => !t.done && !t.blocked);
    taskBox.replaceChildren(
      el('div', { class: 'ht-head' }, el('h3', { class: 'hire-sec-title' }, '할 일'), el('span', { class: 'ht-sub' }, '필요한 일만 골라 실행하세요. 이미 한 일은 다시 하지 않습니다.')),
      el('ul', { class: 'ht-list' }, rows),
      runnable ? el('div', { class: 'ht-foot' }, problem, runBtn) : el('p', { class: 'lead-muted' }, tasks.every((t) => t.done) ? '할 일을 모두 마쳤습니다.' : '지금 할 수 있는 일이 없습니다. 위의 이유를 확인해 주세요.'));
  }

  // 고른 일을 차례로 한다. 하나가 실패해도 나머지는 계속하고, 결과를 사람 기록에 남긴다.
  async function runTasks(chosen, notice) {
    const now = () => new Date().toISOString();
    const by = who(ctx);
    const webhook = settings.company.slack_webhook;
    const log = (text) => { d.log = [{ at: now(), by, text }, ...(d.log ?? [])]; };
    const okAt = (id, extra = {}) => { d.results = { ...d.results, [id]: { status: 'ok', at: now(), by, ...extra } }; };
    const failAt = (id, error) => { d.results = { ...d.results, [id]: { status: 'failed', at: now(), by, error } }; };
    d.notice_dest = notice.dest; d.notice_mentions = notice.mentions;
    const mention = notice.mentions.split(/[\s,]+/).filter(Boolean).map((m) => (m.startsWith('@') ? m : '@' + m)).join(' ');
    const copies = [];
    let done = 0;
    for (const t of chosen) {
      try {
        if (t.id === 'calendar') {
          const item = await ctx.store.create({
            title: fill(h.calendar_title, hireValues(d, settings)), category: 'onboard', repeat_kind: 'none', start_date: d.start_date,
            lead: ctx.me?.name || '', note: [[d.dept, d.team, d.part].filter(Boolean).join(' '), d.job, d.phone ? '연락처 ' + d.phone : ''].filter(Boolean).join(' · '),
          });
          okAt('calendar', { ref: item.id });
          log(`입사일 일정 만듦 (${d.start_date})`);
        } else if (t.id === 'slack:dept' || t.id === 'slack:hr') {
          const textOut = t.id === 'slack:dept'
            ? fill(h.slack_notice, hireValues(d, settings, { mention })).replace(/^\s*님, /, '')
            : fill(h.slack_hr_notice, hireValues(d, settings));
          const where = t.id === 'slack:dept' ? notice.dest.trim() : h.hr_channel;
          if (webhook) { await postSlack(webhook, textOut); okAt(t.id, { where, mention }); log(`${t.label} 보냄 (${where})`); } else {
            copies.push(`[${t.label} → ${where}]\n${textOut}`);
            okAt(t.id, { where, mention, copied: true });
            log(`${t.label} 문구 복사함 (${where} 에 붙여 넣기)`);
          }
        } else if (t.id === 'mail') {
          const subject = fill(h.mail_subject, hireValues(d, settings));
          const body = fill(h.mail_text, hireValues(d, settings));
          const miss = missingKeys(h.mail_text, hireValues(d, settings));
          if (miss.length) throw new Error(`메일 본문에 채우지 못한 자리가 있습니다: ${miss.join(', ')}`);
          location.href = mailtoUrl(d.email, subject, body);
          okAt('mail', { to: d.email });
          log(`안내 메일 앱 엶 (${d.email})`);
        } else if (t.id === 'staff') {
          const staff = await ctx.store.records('staff');
          if (staff.some((s) => s.data.emp_no && s.data.emp_no === d.emp_no)) throw new Error(`사번 ${d.emp_no} 이(가) 직원명부에 이미 있습니다.`);
          const saved = await ctx.store.saveRecord('staff', null, {
            name: d.name, emp_no: d.emp_no, dept: d.dept, team: d.team || '', part: d.part || '', job_group: d.job_group, job: d.job, title: '',
            joined: d.start_date, left: '', email: d.work_email || '', phone: d.phone || '', employ_type: d.employ_type, gender: d.gender || '', eng_name: d.eng_name || '', career: d.career || '', hire_id: id,
          });
          okAt('staff', { ref: saved.id });
          log(`직원명부에 올림 (사번 ${d.emp_no})`);
        }
        done += 1;
      } catch (e) {
        failAt(t.id, e.message || String(e));
        log(`${t.label} 실패: ${e.message}`);
      }
    }
    if (copies.length) {
      const okCopy = await copyText(copies.join('\n\n────────\n\n'));
      if (!okCopy) toast('문구를 복사하지 못했습니다. 할 일의 복사 단추를 눌러 주세요.', { error: true });
    }
    let moved = '';
    if (d.stage === 'register' && d.results?.calendar?.status === 'ok') { d.stage = 'enroll'; log('단계 넘김: 명부 등재(일정을 만들어 자동으로)'); moved = ' 명부 등재로 넘어갔습니다.'; }
    if (d.stage !== 'done' && d.results?.staff?.status === 'ok') { d.stage = 'done'; log('단계 넘김: 끝남(명부 등재를 마쳐 자동으로)'); moved = ' 명부 등재를 마쳐 끝남으로 옮겼습니다.'; }
    try {
      const saved = await ctx.store.saveRecord('hire', id, d);
      tab = d.stage; // 목록도 그 사람이 간 단계를 보여 준다
      const failed = chosen.length - done;
      toast((failed ? `${done}개 했고, ${failed}개는 못 했습니다. 이유를 확인해 주세요.` : `${done}개 모두 했습니다.`) + moved + (copies.length ? ' 복사한 문구를 슬랙에 붙여 넣어 주세요.' : ''), { error: Boolean(failed) });
      ctl.close();
      refresh();
      openHire(ctx, saved, refresh);
    } catch (e) {
      toast(e.message, { error: true });
    }
  }
  drawTasks();

  // ---- 어디에 적었나 · 처리 내역 ----
  const results = isNew ? null : el('section', { class: 'hire-sec' },
    el('h3', { class: 'hire-sec-title' }, '어디에 적었나'),
    el('ul', { class: 'hire-where' }, taskList(d, settings).map((t) => {
      const r = d.results?.[t.id];
      return el('li', { class: r?.status === 'ok' ? 'ok' : r?.status === 'failed' ? 'bad' : '' },
        el('span', { class: 'dot' }), el('span', {}, TASK_LABEL[t.id]),
        el('span', { class: 'hire-where-v' }, r?.status === 'ok' ? (r.copied ? '복사함' : r.where ? `보냄 (${r.where})` : '됨') : r?.status === 'failed' ? '실패' : '아직'));
    })),
    (d.log ?? []).length ? el('h3', { class: 'hire-sec-title', style: 'margin-top:16px' }, '처리 내역') : null,
    (d.log ?? []).length ? el('ul', { class: 'hire-log' }, d.log.slice(0, 30).map((l) => el('li', {}, el('span', { class: 'hire-log-at' }, stamp2(l.at)), el('span', {}, l.text), el('small', {}, String(l.by || '').split('@')[0])))) : null);

  // ---- 저장 ----
  const error = el('p', { class: 'form-error', hidden: true });
  const saveBtn = el('button', { type: 'button', class: 'btn primary', disabled: readOnly }, icon('check'), isNew ? '등록' : '저장');
  saveBtn.addEventListener('click', async () => {
    error.hidden = true;
    const miss = missing();
    if (miss.length) { error.textContent = `필수 칸이 비어 있습니다: ${miss.join(', ')}`; error.hidden = false; form.scrollIntoView({ block: 'start' }); return; }
    saveBtn.disabled = true;
    try {
      if (isNew) d.log = [{ at: new Date().toISOString(), by: who(ctx), text: '입사자 등록' }];
      else d.log = [{ at: new Date().toISOString(), by: who(ctx), text: '정보 고침' }, ...(d.log ?? [])];
      const saved = await ctx.store.saveRecord('hire', id, d);
      toast(isNew ? '등록했습니다. 이어서 할 일을 고르세요.' : '저장했습니다');
      ctl.close();
      refresh();
      if (isNew) openHire(ctx, saved, refresh);
    } catch (e) {
      error.textContent = e.message; error.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });

  const ctl = openDrawer({
    title: isNew ? '입사자 등록' : d.stage === 'enroll' ? '명부 등재' : d.name || '입사자',
    lead: chip(icon('user-add')),
    wide: true,
    body: el('div', {},
      isNew ? el('p', { class: 'lead-muted', style: 'margin-bottom:14px' }, '등록하면 이어서 일정·공지·메일 중 할 일을 골라 실행할 수 있습니다.') : null,
      error, form, taskBox, results),
    footer: el('div', { style: 'display:flex;gap:8px;width:100%;align-items:center' },
      !isNew && d.stage === 'register' && ctx.canEdit ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { ctl.close(); advance(ctx, { id, data: d }, 'enroll', refresh); } }, '명부 등재로') : null,
      !isNew && d.stage === 'enroll' && ctx.canEdit ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { ctl.close(); advance(ctx, { id, data: d }, 'done', refresh); } }, '끝내기') : null,
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn ghost', onclick: () => ctl.close() }, readOnly ? '닫기' : '취소'),
      readOnly ? null : saveBtn),
  });
  setTimeout(() => { if (isNew) name.focus(); }, 50);
  return ctl;
}

// 홈 화면이 쓰는 요약: 입사 예정자(끝남이 아닌 사람) 중 가까운 순.
export function upcomingHires(rows, today = todayYmd()) {
  return rows.filter((r) => r.data.stage !== 'done' && r.data.start_date).sort((a, b) => a.data.start_date.localeCompare(b.data.start_date))
    .map((r) => ({ id: r.id, name: r.data.name, dept: r.data.dept, start_date: r.data.start_date, when: dday(r.data.start_date, today), stage: r.data.stage }));
}

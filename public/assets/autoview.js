// 자동화 화면. 버튼 하나(또는 칸 한두 개)로 기존 업무를 대신하는 것들을 모아 둔다.
//
// 흐름은 늘 같다: 칸을 채운다 → [미리보기] 로 무엇이 일어날지 본다 → [실행] 을 누르면 그제야 나간다.
// 서버가 없는 앱이라 '나간다' 는 두 가지다 — 슬랙 Webhook 을 적어 두었으면 바로 올리고, 아니면 문구를 복사해 붙여 넣는다.
// 메일은 메일 앱을 열어 준다(받는 사람·제목·본문이 채워진 채). 무엇을 했는지는 '실행 내역' 기록으로 남는다.
import { el, replace } from './dom.js';
import { icon } from './icons.js';
import { bubble, chip, confirmBox, copyText, field, iconButton, openDrawer, selectBox, toast } from './ui.js';
import {
  fill, missingKeys, monthLabel, payrollValues, longServiceTargets, longServiceValues,
  stamp, thisMonth, mailtoUrl, postSlack, 짧은날짜,
} from './autotext.js';

export const AUTOS = [
  { id: 'payroll-notice', title: '급여 공지 보내기', icon: 'wallet', what: '법인·귀속월·지급일만 고르면 공지 문구를 만들어 슬랙 채널에 올립니다.' },
  { id: 'longservice-mail', title: '장기근속 케어 메일', icon: 'heart', what: '그 달에 근속 3·6·9년이 되는 사람을 직원명부에서 찾아 지원 안내 메일을 보냅니다.' },
];

// 입력값은 화면을 오가도 남긴다(미리보기를 보고 다른 화면에 다녀와도 그대로).
const keep = {
  'payroll-notice': { corp: '', month: thisMonth(), payday: '' },
  'longservice-mail': { month: thisMonth() },
};

const lastOf = (runs, id) => runs.filter((r) => r.data.auto === id).sort((a, b) => String(b.data.at).localeCompare(String(a.data.at)))[0]?.data ?? null;

async function saveRun(ctx, data) {
  return ctx.store.saveRecord('run', null, { ...data, at: new Date().toISOString(), by: ctx.me?.email || ctx.me?.name || '' });
}

// ---------- 내역 ----------
function historyDrawer(auto, runs) {
  const rows = runs.filter((r) => r.data.auto === auto.id).sort((a, b) => String(b.data.at).localeCompare(String(a.data.at))).slice(0, 50);
  openDrawer({
    title: `${auto.title} 내역`,
    lead: chip(icon('refresh')),
    body: el('div', {},
      el('p', { class: 'lead-muted', style: 'margin-bottom:12px' }, rows.length ? `최근 ${rows.length}건입니다.` : '아직 돌린 적이 없습니다.'),
      rows.length ? el('ul', { class: 'u-list' }, rows.map((r) => {
        const d = r.data;
        const targets = d.targets ?? [];
        return el('li', { class: 'u-row run-row' + (d.ok ? '' : ' bad') },
          el('span', { class: 'run-when' }, stamp(d.at)),
          el('div', { class: 'u-main' },
            el('span', { class: 'u-title' }, d.detail || (d.ok ? '했습니다' : '하지 못했습니다')),
            targets.length ? el('span', { class: 'u-sub' }, (targets.some((t) => String(t.to).includes('@')) ? '받는 사람 ' : '보낸 곳 ') + targets.map((t) => t.name || t.to).join(', ')) : null,
            el('span', { class: 'u-sub' }, d.by ? `${String(d.by).split('@')[0]} 님이 눌렀습니다` : '')),
          el('span', { class: 'run-ok' + (d.ok ? '' : ' bad') }, d.ok ? '됨' : '안 됨'));
      })) : null),
  });
}

// ---------- 급여 공지 ----------
function payrollCard(auto, ctx, settings, runs, refresh) {
  const input = keep[auto.id];
  const corps = settings.payroll.corps ?? [];
  const corpSel = selectBox('법인', [['', corps.length ? '고르세요' : '설정에서 먼저 적어 주세요'], ...corps.map((c) => [c.key, c.label])], input.corp);
  const monthIn = el('input', { type: 'month', 'aria-label': '귀속월', value: input.month });
  const payIn = el('input', { type: 'date', 'aria-label': '지급일', value: input.payday });
  const slot = el('div', { class: 'auto-plan' });
  const runBtn = el('button', { type: 'button', class: 'btn primary', disabled: true }, icon('check'), '실행');
  const previewBtn = el('button', { type: 'button', class: 'btn ghost' }, icon('search'), '미리보기');
  let plan = null;
  let editing = false;
  let resend = false;

  const reset = () => {
    input.corp = corpSel.value; input.month = monthIn.value; input.payday = payIn.value;
    if (!plan) return;
    plan = null; editing = false; resend = false;
    runBtn.disabled = true;
    replace(slot,el('p', { class: 'lead-muted' }, '값이 바뀌었습니다. [미리보기] 를 다시 눌러 주세요.'));
  };
  for (const c of [corpSel, monthIn, payIn]) { c.addEventListener('change', reset); c.addEventListener('input', reset); }

  const lock = () => { runBtn.disabled = !plan?.ok || editing || (plan?.sent_at && !resend); };

  function makePlan(editedText = '') {
    const corp = corps.find((c) => c.key === input.corp);
    if (!corp) return { ok: false, reason: '법인을 골라 주세요.' };
    if (!input.month) return { ok: false, reason: '귀속월을 골라 주세요.' };
    if (!input.payday) return { ok: false, reason: '지급일을 골라 주세요.' };
    const values = payrollValues({ corp, month: input.month, payday: input.payday, manager: settings.payroll.manager, settings });
    const template = editedText || corp.text || settings.payroll.text;
    const summary = `${corp.label} · ${monthLabel(input.month)} 귀속 · ${짧은날짜(input.payday)} 지급`;
    const sent = runs.find((r) => r.data.auto === auto.id && r.data.ok && r.data.summary === summary);
    return {
      ok: true, summary, where: corp.channel || '(채널 미정)', text: fill(template, values), missing: missingKeys(template, values),
      edited: Boolean(editedText), sent_at: sent?.data.at || '', original: fill(corp.text || settings.payroll.text, values),
    };
  }

  function draw() {
    if (!plan?.ok) { replace(slot,el('p', { class: 'form-error' }, plan?.reason ?? '미리보기를 만들지 못했습니다.')); return; }
    const webhook = settings.company.slack_webhook;
    const editBox = editing ? el('textarea', { class: 'auto-edit-box', rows: '14', 'aria-label': '보낼 문구 고치기' }, plan.text) : null;
    replace(slot,
      el('p', { class: 'auto-sum' }, icon('info'), plan.summary),
      el('p', { class: 'lead-muted' }, `보낼 곳: ${plan.where}` + (webhook ? ' · 슬랙 Webhook 으로 바로 올립니다' : ' · 문구를 복사해 슬랙에 붙여 넣습니다')),
      plan.missing.length ? el('p', { class: 'form-error' }, `채우지 못한 자리: ${plan.missing.map((k) => `{{${k}}}`).join(' ')} — [설정]에서 값을 적어 주세요.`) : null,
      plan.sent_at ? el('div', { class: 'auto-resend' },
        el('p', { class: 'form-error' }, `이미 ${plan.where} 에 올린 공지입니다(${stamp(plan.sent_at)}).`),
        el('label', { class: 'check' }, (() => { const b = el('input', { type: 'checkbox' }); b.checked = resend; b.addEventListener('change', () => { resend = b.checked; lock(); }); return b; })(), el('span', {}, '한 번 더 보내기 — 같은 채널에 다시 올립니다'))) : null,
      plan.edited && !editing ? el('p', { class: 'auto-edited' }, icon('edit'), '이번에만 고친 문구입니다. 설정의 문구는 그대로입니다.') : null,
      editing ? editBox : bubble(plan.text, { slack: true }),
      el('div', { class: 'auto-edit-acts' },
        editing
          ? [el('button', { type: 'button', class: 'btn primary sm', onclick: () => { const t = editBox.value.trim(); plan = makePlan(t && t !== plan.original.trim() ? t : ''); editing = false; draw(); lock(); } }, icon('search'), '고친 문구로 다시 보기'),
            el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { editing = false; draw(); lock(); } }, '그만 고치기')]
          : [el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { editing = true; draw(); lock(); } }, icon('edit'), '문구 고치기'),
            plan.edited ? el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { plan = makePlan(''); draw(); lock(); } }, '원래 문구로') : null,
            el('button', { type: 'button', class: 'btn ghost sm', onclick: async () => { toast((await copyText(plan.text)) ? '문구를 복사했습니다' : '복사하지 못했습니다', { error: false }); } }, icon('copy'), '복사')],
        el('span', { class: 'auto-edit-hint' }, editing ? '[다시 보기] 를 눌러야 실행이 열립니다' : '굵게는 *글자* — 별표로 감싸고 닫는 별표 뒤는 띄어 주세요')));
  }

  previewBtn.addEventListener('click', () => { input.corp = corpSel.value; input.month = monthIn.value; input.payday = payIn.value; plan = makePlan(''); draw(); lock(); });

  runBtn.addEventListener('click', async () => {
    if (!plan?.ok) return;
    const webhook = settings.company.slack_webhook;
    const ok = await confirmBox({
      title: `'${auto.title}' 을(를) 실행할까요?`,
      message: (webhook ? '슬랙에 바로 올라갑니다. 되돌릴 수 없습니다.' : '문구가 복사됩니다. 슬랙 채널에 붙여 넣어 올리세요.')
        + (plan.edited ? ' 이번에만 고친 문구로 보냅니다.' : '') + (resend ? ' 이미 올린 공지를 한 번 더 올립니다.' : ''),
      confirm: '실행',
      extra: el('p', { class: 'auto-sum' }, plan.summary),
    });
    if (!ok) return;
    runBtn.disabled = true;
    try {
      let detail;
      if (webhook) { await postSlack(webhook, plan.text); detail = `${plan.where} 에 올렸습니다.`; } else {
        if (!await copyText(plan.text)) throw new Error('복사하지 못했습니다. 문구 아래 [복사] 를 눌러 주세요.');
        detail = `${plan.where} 에 올릴 문구를 복사했습니다. 슬랙에 붙여 넣어 주세요.`;
      }
      await saveRun(ctx, { auto: auto.id, ok: true, detail, summary: plan.summary, targets: [{ name: plan.where, ok: true }], text: plan.text, edited: plan.edited });
      toast(detail);
      refresh();
    } catch (e) {
      await saveRun(ctx, { auto: auto.id, ok: false, detail: e.message, summary: plan.summary, targets: [{ name: plan.where, ok: false }] }).catch(() => {});
      toast(e.message, { error: true });
      runBtn.disabled = false;
    }
  });

  return el('div', { class: 'auto-body' },
    el('div', { class: 'auto-fields' },
      el('label', { class: 'auto-field' }, el('span', {}, '법인'), corpSel),
      el('label', { class: 'auto-field' }, el('span', {}, '귀속월'), monthIn),
      el('label', { class: 'auto-field' }, el('span', {}, '지급일'), payIn)),
    el('div', { class: 'auto-acts' }, previewBtn, runBtn),
    slot);
}

// ---------- 장기근속 케어 메일 ----------
function longServiceCard(auto, ctx, settings, runs, refresh) {
  const input = keep[auto.id];
  const monthIn = el('input', { type: 'month', 'aria-label': '기준월', value: input.month });
  const slot = el('div', { class: 'auto-plan' });
  const runBtn = el('button', { type: 'button', class: 'btn primary', disabled: true }, icon('check'), '실행');
  const previewBtn = el('button', { type: 'button', class: 'btn ghost' }, icon('search'), '미리보기');
  let plan = null;
  let shown = 0; // 미리보기에 펼친 사람

  monthIn.addEventListener('change', () => {
    input.month = monthIn.value;
    if (!plan) return;
    plan = null; runBtn.disabled = true;
    replace(slot,el('p', { class: 'lead-muted' }, '값이 바뀌었습니다. [미리보기] 를 다시 눌러 주세요.'));
  });

  async function makePlan() {
    if (!input.month) return { ok: false, reason: '기준월을 골라 주세요.' };
    const staff = (await ctx.store.records('staff')).map((r) => r.data);
    const people = longServiceTargets(staff, input.month, settings.longservice.grants).map((p) => {
      const values = longServiceValues(p, input.month, settings);
      return { ...p, subject: fill(settings.longservice.subject, values), body: fill(settings.longservice.body, values) };
    });
    const send = people.filter((p) => !p.skip);
    const summary = `${monthLabel(input.month)} 대상자 ${send.length}명` + (people.length - send.length ? ` (건너뜀 ${people.length - send.length}명)` : '');
    const sent = runs.find((r) => r.data.auto === auto.id && r.data.ok && r.data.summary === summary);
    return { ok: true, people, send, summary, sent_at: sent?.data.at || '', ran: false };
  }

  function draw() {
    if (!plan?.ok) { replace(slot,el('p', { class: 'form-error' }, plan?.reason ?? '미리보기를 만들지 못했습니다.')); return; }
    if (!plan.people.length) {
      replace(slot,el('p', { class: 'auto-sum' }, icon('info'), `${monthLabel(input.month)}에 근속 ${(settings.longservice.grants ?? []).map((g) => g.years).join('·')}년이 되는 사람이 직원명부에 없습니다.`));
      return;
    }
    const who = plan.people[shown] ?? plan.people[0];
    replace(slot,
      el('p', { class: 'auto-sum' }, icon('info'), plan.summary),
      plan.sent_at && !plan.ran ? el('p', { class: 'form-error' }, `같은 대상자에게 이미 보냈습니다(${stamp(plan.sent_at)}). 다시 실행하면 한 번 더 보내는 것입니다.`) : null,
      el('ul', { class: 'auto-list' }, plan.people.map((p, i) => el('li', { class: (p.skip ? 'off' : '') + (i === shown ? ' on' : '') },
        el('button', { type: 'button', class: 'auto-person', onclick: () => { shown = i; draw(); } },
          el('span', { class: 'auto-who' }, `${p.name} · 근속 ${p.years}년`),
          el('span', { class: 'auto-sub' }, p.skip ? p.skip : `${p.day} · ${p.email} · 지원금 ${p.amount.toLocaleString('ko-KR')}원 · 휴가 ${p.leave}일`)),
        plan.ran && !p.skip ? el('span', { class: 'auto-person-acts' },
          el('a', { class: 'btn primary sm', href: mailtoUrl(p.email, p.subject, p.body) }, icon('mail'), '메일 앱 열기'),
          el('button', { type: 'button', class: 'btn ghost sm', onclick: async () => toast((await copyText(`${p.subject}\n\n${p.body}`)) ? '제목과 본문을 복사했습니다' : '복사하지 못했습니다') }, icon('copy'), '복사')) : null))),
      el('div', { class: 'auto-mailpv' },
        el('p', { class: 'lead-muted' }, `${who.name} 님에게 갈 메일`),
        el('div', { class: 'kv' }, el('span', {}, '받는 사람'), el('b', {}, who.email || '-')),
        el('div', { class: 'kv' }, el('span', {}, '제목'), el('b', {}, who.subject)),
        bubble(who.body)));
  }

  previewBtn.addEventListener('click', async () => {
    input.month = monthIn.value;
    replace(slot,el('p', { class: 'lead-muted' }, '직원명부에서 대상자를 찾는 중…'));
    try { plan = await makePlan(); } catch (e) { plan = { ok: false, reason: e.message }; }
    shown = 0;
    draw();
    runBtn.disabled = !plan?.ok || !plan.send?.length;
  });

  runBtn.addEventListener('click', async () => {
    if (!plan?.ok) return;
    const ok = await confirmBox({
      title: `'${auto.title}' 을(를) 실행할까요?`,
      message: '대상자마다 메일 앱을 열어 보냅니다. 실행하면 아래 목록에 [메일 앱 열기] 단추가 생기고, 실행 내역에 적힙니다.',
      confirm: '실행',
      extra: el('ul', { class: 'ht-confirm' }, plan.send.map((p) => el('li', {}, `${p.name} · ${p.email}`))),
    });
    if (!ok) return;
    plan.ran = true;
    const names = plan.send.map((p) => p.name).join('·');
    await saveRun(ctx, {
      auto: auto.id, ok: true, summary: plan.summary, detail: `${names}에게 보낼 메일을 만들었습니다. 메일 앱에서 보내 주세요.`,
      targets: plan.send.map((p) => ({ name: p.name, to: p.email, ok: true })),
    }).catch((e) => toast(e.message, { error: true }));
    draw();
    runBtn.disabled = true;
    toast('아래 [메일 앱 열기] 를 사람마다 눌러 보내 주세요.');
  });

  // 서버가 없어 매달 저절로 돌지는 못한다. 대신 캘린더에 매달 1일 알림 일정을 넣어 준다.
  const remindBtn = el('button', {
    type: 'button', class: 'btn ghost sm',
    onclick: async () => {
      const ok = await confirmBox({ title: '매달 1일 알림 일정을 만들까요?', message: "캘린더 '복지' 분야에 '장기근속 케어 메일 보내기' 가 매달 1일(휴일이면 다음 평일)에 뜹니다.", confirm: '만들기' });
      if (!ok) return;
      try {
        await ctx.store.create({ title: '장기근속 케어 메일 보내기', category: 'welfare', repeat_kind: 'monthly', on_day: 1, holiday_rule: 'after', lead: ctx.me?.name || '', note: '자동화 → 장기근속 케어 메일에서 기준월을 고르고 [미리보기] → [실행]' });
        toast('캘린더에 알림 일정을 만들었습니다');
      } catch (e) { toast(e.message, { error: true }); }
    },
  }, icon('calendar'), '매달 1일 캘린더 알림 만들기');

  return el('div', { class: 'auto-body' },
    el('p', { class: 'auto-cycle' }, icon('refresh'), '매달 1일에 그 달 대상자를 확인해 보냅니다. ', remindBtn),
    el('div', { class: 'auto-fields' }, el('label', { class: 'auto-field' }, el('span', {}, '기준월'), monthIn)),
    el('div', { class: 'auto-acts' }, previewBtn, runBtn),
    slot);
}

const CARD = { 'payroll-notice': payrollCard, 'longservice-mail': longServiceCard };

function card(auto, ctx, settings, runs, refresh) {
  const last = lastOf(runs, auto.id);
  return el('section', { class: 'auto-card card' },
    el('div', { class: 'auto-head' },
      chip(icon(auto.icon)),
      el('div', { class: 'auto-title' }, el('h2', {}, auto.title), el('p', {}, auto.what)),
      el('button', { type: 'button', class: 'btn ghost sm', onclick: () => historyDrawer(auto, runs) }, icon('refresh'), '내역'),
      ctx.canEdit ? el('button', { type: 'button', class: 'btn ghost sm', onclick: () => ctx.openSettings(auto.id === 'payroll-notice' ? 'payroll' : 'longservice', refresh) }, icon('edit'), '설정') : null),
    ctx.canEdit ? CARD[auto.id](auto, ctx, settings, runs, refresh) : el('p', { class: 'lead-muted' }, '보기 전용입니다. 관리자가 로그인하면 실행할 수 있습니다.'),
    last ? el('p', { class: 'auto-last' + (last.ok ? '' : ' bad') }, `마지막 실행 ${stamp(last.at)} · ${last.detail}`) : null);
}

function listRow(auto, runs, ctx) {
  const last = lastOf(runs, auto.id);
  return el('li', {}, el('a', { class: 'auto-row', href: '#/auto/' + auto.id },
    chip(icon(auto.icon)),
    el('span', { class: 'auto-rowtext' },
      el('span', { class: 'auto-rowtitle' }, auto.title),
      el('span', { class: 'auto-rowwhat' }, auto.what),
      last ? el('span', { class: 'auto-rowlast' + (last.ok ? '' : ' bad') }, `마지막 ${stamp(last.at)} · ${last.detail}`) : null),
    icon('right')));
}

// id 가 없으면 목록, 있으면 그 업무 하나만.
export async function renderAuto(root, ctx, id = '') {
  const refresh = () => renderAuto(root, ctx, id);
  root.replaceChildren(el('div', { class: 'card' }, el('p', { class: 'lead-muted' }, '불러오는 중')));
  let runs = [];
  let settings;
  let locked = '';
  try {
    settings = await ctx.settings();
    try { runs = await ctx.store.records('run'); } catch (e) { locked = e.message; }
  } catch (e) {
    root.replaceChildren(el('div', { class: 'card' }, el('p', { class: 'sec-empty' }, e.message)));
    return;
  }

  if (id) {
    const auto = AUTOS.find((a) => a.id === id);
    root.replaceChildren(
      el('a', { class: 'btn ghost sm auto-back', href: '#/auto' }, icon('left'), '자동화 전체'),
      auto ? card(auto, ctx, settings, runs, refresh) : el('div', { class: 'card' }, el('p', { class: 'sec-empty' }, '그런 자동화를 찾을 수 없습니다')));
    return;
  }

  root.replaceChildren(el('div', { class: 'card' },
    el('div', { class: 'cal-head' }, chip(icon('app')), el('h2', {}, '자동화')),
    el('p', { class: 'lead-muted', style: 'margin:-6px 0 14px' }, '버튼 하나로 대신할 수 있는 일입니다. 보낼 내용을 먼저 보여 드리고, 확인을 누르면 그때 나갑니다.'),
    locked ? el('p', { class: 'cal-warn' }, icon('alert'), locked + ' 실행 내역과 입사자·직원명부는 로그인한 뒤에 보입니다.') : null,
    el('ul', { class: 'auto-rows' },
      el('li', {}, el('a', { class: 'auto-row', href: '#/hire' },
        chip(icon('user-add')),
        el('span', { class: 'auto-rowtext' },
          el('span', { class: 'auto-rowtitle' }, '신규 입사자'),
          el('span', { class: 'auto-rowwhat' }, '입사 확정 → 일정·공지·안내 메일 → 명부 등재까지 한 자리에서 합니다.')),
        icon('right'))),
      ...AUTOS.map((a) => listRow(a, runs, ctx)),
      el('li', {}, el('a', { class: 'auto-row', href: '#/cert' },
        chip(icon('doc')),
        el('span', { class: 'auto-rowtext' },
          el('span', { class: 'auto-rowtitle' }, '증명서 발급'),
          el('span', { class: 'auto-rowwhat' }, '면접확인서·취업활동 증명서·재직증명서·경력증명서를 PDF 로 만들고 발급대장에 적습니다.')),
        icon('right'))))));
}

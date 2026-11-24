// 퇴직자 화면(#/offboard, 2026-11-23).
// 목록: 이름 · 소속 · 마지막 근무일 · 실퇴직일 · 잔여연차 · 할 일 점(지금 할 일 여섯 + 그날 할 일 둘).
// [퇴직자 등록] 서랍:
//   이름(또는 사번)과 실퇴직일을 적으면 그 자리에서 잔여연차를 센다(아무것도 저장하지 않는다).
//   → 마지막 근무일·퇴사 사유·조정·DM 문안 → [미리보기](무엇을 언제 할지 보여 주기만 한다)
//   → [등록하고 실행] 한 번 더 묻고 고른 일을 한다.
// 서버가 없는 앱이라: 채널 공유는 슬랙 Webhook 이 있으면 올리고 없으면 복사하고, 안내 DM 은 문안을 복사하며,
// 조직도 정리는 그 시각이 지난 뒤 관리자가 앱을 열었을 때 한다(offboardrun.js 의 퇴직시계).
import { el, replace } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, field, openDrawer, selectBox, toast } from './ui.js';
import { todayYmd } from './autotext.js';
import { loadDoc } from './docs.js';
import { ORG_ID } from './orgchart.js';
import {
  날꼴, 숫자글, 문장나누기, 사람찾기, 소속글, 잔여연차, 막근참고, 막근글, 문안이름, 문안종류, 계획만들기, 점들, 목록차례, 남은날글,
  이미함, 지금하기, 결과줄들,
} from './offboardcalc.js';
import { kv, 근거칸, 알림칸, 계획칸, 결과목록, 그날결과 } from './offboardplan.js';
import { 지금할일하기, 그날하기, 적기, 퇴직예약처리 } from './offboardrun.js';
import { 퇴직자상세 } from './offboarddetail.js';

const 기본사유 = '자발적인 퇴사';
const 글 = (v) => String(v ?? '').trim();
let query = '';

// ── 사용 방법 ──
function 사용방법() {
  const 절 = (제목, 줄) => el('section', { class: 'gd-sec' }, el('h4', {}, 제목), el('ul', {}, 줄.map((t) => el('li', {}, t))));
  openDrawer({
    title: '퇴직자 — 사용 방법',
    lead: chip(icon('info')),
    body: el('div', { class: 'gd' },
      el('p', { class: 'lead-muted' }, '퇴직자를 등록하면 퇴사일 적기, 캘린더 일정, 팀 피플 채널 공유, 안내 DM, 모두싸인 엑셀 가운데 고른 일을 한 번에 합니다. 조직도는 정한 날짜에 저절로 정리합니다.'),
      절('순서', [
        '[퇴직자 등록]을 누르고 「이름 또는 사번」과 「실퇴직일」을 적습니다. 잔여연차를 바로 셉니다.',
        '잔여연차 근거의 줄을 누르면 그 숫자가 어디서 왔는지 펼쳐집니다.',
        '「마지막 근무일」과 「퇴사 사유」를 적고 [미리보기]를 누릅니다. 아직 아무것도 하지 않습니다.',
        '하지 않을 일만 체크를 끄고 [등록하고 실행]을 누른 뒤 확인 창에서 한 번 더 누릅니다.',
        '목록에서 이름을 누르면 할 일마다 됐는지 보이고, 못 한 일만 골라 다시 할 수 있습니다.',
      ]),
      절('알아 둘 점', [
        '채널 공유와 안내 DM 은 되돌릴 수 없습니다. 슬랙 Webhook 이 없으면 문구를 복사해 드리니 슬랙에 붙여 넣습니다.',
        '조직도는 마지막 근무일 17:00 에 퇴직예정자 칸으로 옮기고, 실퇴직일 17:00 에 지웁니다. 그 시각이 지난 뒤 관리자가 이 앱을 열면 합니다.',
        '직원명부는 퇴사일이 지나면 저절로 퇴사자로 넘어갑니다.',
        "사용 연차는 직원명부의 '사용 연차' 칸으로 셉니다. 비어 있으면 등록할 때 직접 적습니다.",
        '모두싸인을 골랐으면 받은 엑셀을 모두싸인 대량 전송에 올립니다.',
      ]),
      절('막혔을 때', [
        '「직원명부에서 그 사람을 찾지 못했습니다」 — 이름·사번이 직원명부와 같은지 확인합니다. 사번이 더 정확합니다.',
        '[등록하고 실행]이 눌리지 않음 — [미리보기]를 아직 안 눌렀거나, 누른 뒤에 값을 고쳤습니다. 다시 누릅니다.',
        '복사가 안 됨 — 브라우저가 복사를 막았습니다. 상세 서랍에서 「한 번 더 보내기」로 다시 복사합니다.',
      ])),
  });
}

// ── 목록 ──
function head(ctx, refresh) {
  return el('div', { class: 'cal-head' },
    chip(icon('open')),
    el('h2', {}, '퇴직자'),
    el('div', { class: 'cal-tools' },
      el('button', { type: 'button', class: 'btn ghost', onclick: 사용방법 }, icon('info'), '사용 방법'),
      ctx.canEdit ? el('button', { type: 'button', class: 'btn ghost', onclick: () => ctx.openSettings('offboard', refresh) }, icon('edit'), '설정') : null,
      ctx.canEdit ? el('button', { type: 'button', class: 'btn primary', onclick: () => 등록서랍(ctx, refresh) }, icon('plus'), '퇴직자 등록') : null));
}

const 짧은날 = (d) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(글(d));
  return m ? `${Number(m[1])}/${Number(m[2])}` : '—';
};

function 줄(row, ctx, refresh, 오늘) {
  const r = row.data;
  const 남음 = 남은날글(r.leave_day, 오늘);
  return el('div', { class: 'hire-row ob-row' },
    el('div', { class: 'hire-date' + (남음 === '지남' ? ' past' : '') },
      el('span', { class: 'hire-date-day' }, 짧은날(r.leave_day)),
      el('span', { class: 'hire-date-left' }, 남음 ? `실퇴직 ${남음}` : '실퇴직일 없음')),
    el('div', { class: 'hire-who' },
      el('button', { type: 'button', class: 'ob-name', onclick: () => 퇴직자상세(ctx, row.id, refresh) }, r.name || '이름 없음'),
      el('span', { class: 'hire-dept' }, r.dept || '소속 없음')),
    el('dl', { class: 'ob-facts' },
      el('div', {}, el('dt', {}, '마지막 근무일'), el('dd', {}, r.last_day || '—')),
      el('div', {}, el('dt', {}, '실퇴직일'), el('dd', {}, r.leave_day || '—')),
      el('div', {}, el('dt', {}, '잔여연차'), el('dd', {}, typeof r.leave_days === 'number' ? 숫자글(r.leave_days) : '모름'))),
    el('div', { class: 'hire-pips' }, 점들(r).map((p) => el('span', { class: `hire-pip ${p.꼴}`, title: p.말 }, p.이름))));
}

export async function renderOffboard(root, ctx) {
  const refresh = () => renderOffboard(root, ctx);
  root.replaceChildren(el('div', { class: 'card' }, head(ctx, refresh), el('p', { class: 'lead-muted' }, '불러오는 중')));
  let rows;
  try {
    await 퇴직예약처리(ctx); // 때가 지난 조직도 정리가 있으면 먼저 한다
    rows = await ctx.store.records('offboard');
  } catch (e) {
    root.replaceChildren(el('div', { class: 'card' }, head(ctx, refresh), el('p', { class: 'sec-empty' }, e.message)));
    return;
  }
  const 오늘 = todayYmd();
  const search = el('input', { type: 'search', class: 'hire-search', placeholder: '이름·소속으로 찾기', 'aria-label': '이름·소속으로 찾기', autocomplete: 'off', value: query });
  const body = el('div', {});
  const paint = () => {
    const q = query.trim();
    const list = 목록차례(rows, 오늘).filter((r) => !q || `${r.data.name} ${r.data.dept}`.includes(q));
    replace(body, list.length
      ? el('div', { class: 'hire-list' }, list.map((r) => 줄(r, ctx, refresh, 오늘)))
      : el('div', { class: 'sec-empty' },
        el('p', {}, q ? `'${q}' 에 맞는 사람이 없습니다.` : ctx.canEdit ? '등록한 퇴직자가 없습니다.' : '퇴직자 기록은 관리자로 로그인해야 보입니다.'),
        !q && ctx.canEdit ? el('button', { type: 'button', class: 'btn primary', onclick: () => 등록서랍(ctx, refresh) }, icon('plus'), '퇴직자 등록') : null));
  };
  search.addEventListener('input', () => { query = search.value; paint(); });
  paint();
  root.replaceChildren(el('div', { class: 'card' },
    head(ctx, refresh),
    el('div', { class: 'hire-bar' }, search,
      el('p', { class: 'hire-notice' }, icon('info'), '등록하면 고른 일(퇴사일 적기·일정·공지·안내 DM)을 바로 합니다. 조직도는 그날 저절로 정리합니다.')),
    body));
}

// ── 등록 서랍 ──
async function 등록서랍(ctx, refresh) {
  let settings; let staff; let org; let 등록된;
  try {
    [settings, staff, org, 등록된] = await Promise.all([
      ctx.settings(), ctx.store.records('staff'), loadDoc(ctx.store, 'org', ORG_ID, { rows: [], history: [] }), ctx.store.records('offboard'),
    ]);
  } catch (e) { toast(e.message, { error: true }); return; }
  const 오늘 = todayYmd();

  const 고른 = { 줄번호: '', 본자리: '' };   // 동명이인·조직도 본 자리 — 사람이 바뀌면 비운다
  const 근거열림 = new Set();               // 근거 표에서 펼친 줄(다시 세도 펼친 채로)
  const 계획고름 = {};                      // 계획 칸에서 손으로 켜고 끈 것
  let 사람 = null;                          // 찾은 직원명부 줄
  let 계획 = null;                          // 마지막 미리보기 { plan, rec }
  let 계획때 = '';                          // 그 미리보기를 볼 때의 값
  let 지금계획 = null;
  let 등록됨 = false;
  let 등록중 = false;

  const input = (attrs) => el('input', { autocomplete: 'off', ...attrs });
  const 누구 = input({ type: 'text', placeholder: '예: 김보람 또는 E1002', maxlength: '40' });
  const 실퇴직 = input({ type: 'date' });
  const 마지막 = input({ type: 'date' });
  const 사유 = input({ type: 'text', maxlength: '200', value: 기본사유 });
  const 조정 = input({ type: 'number', step: '0.5', inputmode: 'decimal', placeholder: '0' });
  const 직접 = input({ type: 'number', step: '0.5', min: '0', inputmode: 'decimal', placeholder: '비우면 직원명부 값' });
  const 문안칸 = selectBox('안내 DM 문안', [['', '자동'], ...Object.entries(문안이름)], '');
  const 오류 = el('p', { class: 'form-error', hidden: true });

  const 계산자리 = el('div', { class: 'ob-calc' });
  const 계획자리 = el('div', {});
  const 미리보기단추 = el('button', { type: 'button', class: 'btn ghost' }, icon('search'), '미리보기');
  const 실행단추 = el('button', { type: 'button', class: 'btn primary', disabled: true }, icon('check'), '등록하고 실행');
  const 취소단추 = el('button', { type: 'button', class: 'btn ghost' }, '취소');

  const 수 = (node) => (글(node.value) === '' ? undefined : Number(node.value));
  const 지금잔여 = () => (사람 && 날꼴.test(실퇴직.value) ? 잔여연차(사람.data, 실퇴직.value, { 조정: 수(조정) ?? 0, 사용직접: 수(직접) }) : null);

  // 지금 칸의 값으로 기록을 만든다(저장 전).
  function 기록만들기() {
    const s = 사람.data;
    const 잔여 = 지금잔여();
    return {
      name: 글(s.name), emp_no: 글(s.emp_no), staff_id: 사람.id, dept: 소속글(s), title: 글(s.title), job_group: 글(s.job_group), job: 글(s.job),
      email: 글(s.email), join_date: 글(s.joined), group_join_date: 글(s.group_joined),
      last_day: 마지막.value, leave_day: 실퇴직.value, reason: 글(사유.value), adjust: 수(조정) ?? 0, used_direct: 수(직접) ?? null,
      notice_kind: 문안칸.value || 문안종류(s.joined, 실퇴직.value), leave_days: 잔여?.잔여 ?? null, basis: 잔여, org_row_id: 고른.본자리,
      results: {}, slots: {}, log: [],
    };
  }

  // ── 잔여연차 칸 ──
  function 셈() {
    const 후보 = 사람찾기(staff, 누구.value, 오늘);
    사람 = 후보.length === 1 ? 후보[0] : 후보.find((r) => r.id === 고른.줄번호) ?? null;
    if (!글(누구.value) || !날꼴.test(실퇴직.value)) {
      replace(계산자리, el('p', { class: 'lead-muted' }, '이름과 실퇴직일을 적으면 여기에 잔여연차가 나옵니다.'));
      화면맞추기();
      return;
    }
    if (!후보.length) {
      replace(계산자리, el('p', { class: 'form-error' }, '직원명부 재직자에서 그 사람을 찾지 못했습니다.\n이름이나 사번이 직원명부와 같은지 확인해 주세요.'));
      화면맞추기();
      return;
    }
    const 고르기 = 후보.length > 1 ? (() => {
      const sel = selectBox('같은 이름이 여럿입니다', [['', '고르세요'], ...후보.map((r) => [r.id, `${r.data.emp_no || '사번 없음'} · ${소속글(r.data) || '소속 없음'}`])], 고른.줄번호);
      sel.addEventListener('change', () => { 고른.줄번호 = sel.value; 셈(); });
      return field('같은 이름이 여럿입니다', sel, '직원명부에 같은 이름이 여럿입니다. 소속을 보고 골라 주세요.');
    })() : null;
    if (!사람) { replace(계산자리, 고르기); 화면맞추기(); return; }

    const p = 사람.data;
    const 잔여 = 지금잔여();
    const 참고 = 잔여 ? 막근참고(잔여.잔여, 실퇴직.value) : null;
    const 자동 = 문안종류(p.joined, 실퇴직.value);
    문안칸.options[0].textContent = 자동 ? `자동 (${문안이름[자동]})` : '자동 (입사일을 확인해 주세요)';
    replace(계산자리,
      고르기,
      el('div', { class: 'ob-person' },
        kv('사람', `${p.name} · ${p.emp_no || '사번 없음'}`),
        kv('소속', 소속글(p) || '—'),
        kv('직책·직군', [p.title, p.job_group].filter(Boolean).join(' / ') || '—'),
        kv('입사일', `${p.joined || '—'}${p.group_joined && p.group_joined !== p.joined ? ` (그룹 ${p.group_joined})` : ''}`),
        kv('회사 이메일', p.email || '—')),
      잔여
        ? el('div', { class: 'ob-calc-sum' }, el('span', { class: 'ob-calc-k' }, '잔여연차'), el('strong', { class: 'ob-calc-v' }, 숫자글(잔여.잔여)))
        : el('p', { class: 'form-error' }, '입사일을 몰라 잔여연차를 셀 수 없습니다.'),
      잔여 && 잔여.사용 === null ? el('p', { class: 'form-error' }, "직원명부에 '사용 연차' 가 없습니다.\n아래 「사용 연차(직접 적기)」 칸에 쓴 일수를 적어 주세요.") : null,
      근거칸(잔여, 근거열림),
      참고 ? el('div', { class: 'ob-lastday' },
        el('p', {}, 막근글(참고)),
        el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { 마지막.value = 참고.날; 화면맞추기(); } }, '이 날을 마지막 근무일로')) : null);
    화면맞추기();
  }

  // 미리보기를 본 뒤 값을 고쳤으면 실행을 막고 다시 보라고 한다.
  const 지금때값 = () => JSON.stringify([사람?.id ?? '', 실퇴직.value, 마지막.value, 사유.value, 조정.value, 직접.value, 문안칸.value, 고른.본자리]);
  const 계획그대로 = () => Boolean(계획) && 지금때값() === 계획때;
  function 화면맞추기() {
    미리보기단추.disabled = 등록중 || 등록됨;
    실행단추.disabled = 등록됨 || 등록중 || !계획그대로() || Boolean(계획?.plan.고르기?.자리);
    계획자리.querySelector('.ob-stale')?.toggleAttribute('hidden', !계획 || 계획그대로());
  }

  function 미리보기() {
    오류.hidden = true;
    const 막기 = (말) => { 계획 = null; replace(계획자리, el('p', { class: 'form-error' }, 말)); 화면맞추기(); };
    if (!사람) return 막기('먼저 이름과 실퇴직일로 사람을 찾아 주세요.');
    if (등록된.some((r) => r.data.staff_id === 사람.id || (글(r.data.emp_no) && r.data.emp_no === 글(사람.data.emp_no)))) return 막기('이미 등록한 퇴직자입니다.\n목록에서 이름을 눌러 고쳐 주세요.');
    if (마지막.value && 마지막.value > 실퇴직.value) return 막기('마지막 근무일이 실퇴직일보다 뒤일 수 없습니다.');
    const rec = 기록만들기();
    const plan = 계획만들기({ rec, settings, staffRow: 사람, orgRows: org.rows, webhook: 글(settings.company?.slack_webhook) });
    계획 = { plan, rec };
    계획때 = 지금때값();
    지금계획 = 계획칸(plan, rec, 계획고름);
    const 자리칸 = plan.고르기.자리 ? (() => {
      const sel = selectBox('조직도 본 자리', [['', '고르세요'], ...plan.고르기.자리.map((x) => [x.id, x.경로])], 고른.본자리);
      sel.addEventListener('change', () => { 고른.본자리 = sel.value; 미리보기(); });
      return field('조직도 본 자리', sel, '조직도에 이 이름의 상자가 여럿입니다. 이 사람의 본 자리를 골라야 등록할 수 있습니다.');
    })() : null;
    replace(계획자리,
      el('p', { class: 'form-error ob-stale', hidden: true }, '미리보기를 본 뒤 위의 값을 고쳤습니다.\n[미리보기] 를 다시 눌러 주세요.'),
      자리칸,
      지금계획.node);
    화면맞추기();
    return undefined;
  }

  async function 실행() {
    if (등록중 || 등록됨 || !계획그대로()) return;
    오류.hidden = true;
    const 빠짐 = [!마지막.value ? '마지막 근무일' : '', !글(사유.value) ? '퇴사 사유' : ''].filter(Boolean);
    if (빠짐.length) { 오류.textContent = `${빠짐.join('·')}을(를) 적어 주세요.`; 오류.hidden = false; 오류.scrollIntoView({ block: 'nearest' }); return; }
    const { tasks, past } = 지금계획.고른것();
    const { rec, plan } = 계획;
    const ok = await confirmBox({
      title: `${rec.name}님을 퇴직자로 등록할까요?`,
      message: '공지·DM 처럼 되돌릴 수 없는 일이 있습니다.',
      confirm: '등록하고 실행',
      extra: el('ul', { class: 'ht-confirm' }, 지금계획.확인줄().map((t) => el('li', {}, t))),
    });
    if (!ok || !계획그대로()) return;
    등록중 = true;
    화면맞추기();
    실행단추.lastChild.textContent = '등록하는 중…';
    let 결과 = {};
    try {
      적기(rec, ctx, 'register', '퇴직자 등록');
      결과 = await 지금할일하기(ctx, settings, rec, tasks);
      // 그날 할 일: 막힌 것은 하지 않고, 날짜가 지난 것은 고른 대로, 나머지는 예약한다.
      for (const t of plan.그날할일) {
        if (t.blocked) { rec.slots[t.id] = { status: 'skipped', 때: t.때, note: t.blocked }; continue; }
        if (past[t.id] === 이미함) { rec.slots[t.id] = { status: 'already', 때: t.때, note: '등록할 때 이미 했다고 골랐습니다.' }; continue; }
        rec.slots[t.id] = { status: 'waiting', 때: t.때 };
        if (past[t.id] === 지금하기) await 그날하기(ctx, rec, t.id);
      }
      await ctx.store.saveRecord('offboard', null, rec);
      등록됨 = true;
    } catch (e) {
      오류.textContent = e.message || '등록하지 못했습니다.';
      오류.hidden = false;
      실행단추.lastChild.textContent = '등록하고 실행';
    } finally {
      등록중 = false;
      화면맞추기();
    }
    if (!등록됨) return;
    const 못함 = 결과줄들(결과).못함;
    toast(못함 ? `등록했습니다. ${못함}개는 못 했습니다. 까닭을 확인해 주세요.` : '등록했습니다.', { error: Boolean(못함) });
    refresh();
    replace(ctl.panel.querySelector('.d-body'),
      el('p', { class: 'lead-muted' }, `${rec.name}님을 등록했습니다. 아래에서 할 일마다 어떻게 됐는지 확인하세요.`),
      el('h4', { class: 'ob-plan-title', style: 'margin-top:14px' }, '지금 할 일 결과'),
      결과목록(결과) ?? el('p', { class: 'lead-muted' }, '고른 지금 할 일이 없었습니다.'),
      el('h4', { class: 'ob-plan-title', style: 'margin-top:14px' }, '그날 할 일'),
      그날결과(rec.slots),
      Object.values(결과).some((r) => r.copied) ? el('p', { class: 'ob-notes' }, icon('info'), el('span', {}, '복사한 문구가 클립보드에 있습니다. 슬랙에 붙여 넣어 주세요.')) : null);
    실행단추.hidden = true;
    취소단추.textContent = '닫기';
  }

  const form = el('form', { class: 'hire-form ob-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    오류,
    el('h4', { class: 'ob-plan-title' }, '누가 언제'),
    el('div', { class: 'row' }, field('이름 또는 사번', 누구, '직원명부 재직자에서 찾습니다.'), field('실퇴직일', 실퇴직, '아직 희망일이어도 됩니다. 적으면 바로 잔여연차를 셉니다.')),
    el('section', { class: 'hire-sec' },
      el('div', { class: 'ht-head' }, el('h3', { class: 'hire-sec-title' }, '잔여연차'), el('span', { class: 'ht-sub' }, '계산만 하고 등록하지 않아도 됩니다. 아무것도 저장하지 않습니다.')),
      계산자리,
      el('div', { class: 'row', style: 'margin-top:10px' }, field('사용 연차(직접 적기)', 직접, '적으면 직원명부 값 대신 이 값으로 셉니다.'),
        field('조정(일)', 조정, '포상 휴가처럼 기록으로 셀 수 없는 일수. 빼려면 앞에 - 를 붙입니다.'))),
    el('section', { class: 'hire-sec' },
      el('h3', { class: 'hire-sec-title', style: 'margin-bottom:10px' }, '등록할 값'),
      el('div', { class: 'row' }, field('마지막 근무일', 마지막, '비워 두면 미리보기까지만 됩니다.'), field('퇴사 사유', 사유)),
      el('div', { class: 'row' }, field('안내 DM 문안', 문안칸, '자동이면 입사일·실퇴직일로 고릅니다.'))),
    el('section', { class: 'hire-sec' },
      el('div', { class: 'ht-head' }, el('h3', { class: 'hire-sec-title' }, '계획'), el('span', { class: 'ht-sub' }, '[미리보기] 를 누르면 무엇을 언제 할지 보여 줍니다. 아직 아무것도 하지 않습니다.')),
      el('div', { style: 'margin-bottom:10px' }, 미리보기단추),
      계획자리));

  const ctl = openDrawer({
    title: '퇴직자 등록',
    lead: chip(icon('open')),
    wide: true,
    body: form,
    footer: el('div', { style: 'display:flex;gap:8px;width:100%;align-items:center' }, el('span', { class: 'spacer' }), 취소단추, 실행단추),
  });
  취소단추.addEventListener('click', () => ctl.close());
  미리보기단추.addEventListener('click', 미리보기);
  실행단추.addEventListener('click', 실행);

  let timer = 0;
  const 다시셈 = () => { clearTimeout(timer); timer = setTimeout(셈, 250); 화면맞추기(); };
  누구.addEventListener('input', () => { 고른.줄번호 = ''; 고른.본자리 = ''; 근거열림.clear(); 다시셈(); });
  for (const node of [실퇴직, 조정, 직접]) node.addEventListener('input', 다시셈);
  form.addEventListener('input', 화면맞추기);
  form.addEventListener('change', 화면맞추기);
  셈();
  setTimeout(() => 누구.focus(), 50);
}

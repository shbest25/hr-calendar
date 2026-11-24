// 퇴직자의 할 일을 실제로 하는 곳(2026-11-23).
//   지금 할 일: 직원명부 퇴사일·캘린더 일정·구글 일정·채널 공유·안내 DM·모두싸인 엑셀
//   그날 할 일: 조직도 — 마지막 근무일 17:00 에 퇴직예정자 칸으로 옮기고, 실퇴직일 17:00 에 지운다
// 서버가 없으므로 그날 할 일은 그 시각이 지난 뒤 관리자가 이 앱을 열었을 때 한다(퇴직시계).
import { fill, postSlack } from './autotext.js';
import { copyText } from './ui.js';
import { loadDoc, saveDoc } from './docs.js';
import { ORG_ID, TO_ID, treeOf, topUnits, countPeople, 리더정보 } from './orgchart.js';
import {
  퇴직값들, 일정들, 구글일정주소, 조직자리, 문안이름, 짧은이름, 그날할일들, 때지남, 날꼴,
} from './offboardcalc.js';
import { 퇴직서류받기 } from './offboardxl.js';

const 글 = (v) => String(v ?? '').trim();
const 빈조직 = { rows: [], history: [] };
const 빈자리 = { seats: [], log: [] };
const 새번호 = (앞) => 앞 + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const 누구 = (ctx) => ctx.me?.email || ctx.me?.name || '';
const 지금 = () => new Date().toISOString();

export function 적기(rec, ctx, target, text) {
  rec.log = [{ at: 지금(), by: 누구(ctx), target, text }, ...(rec.log ?? [])].slice(0, 200);
}

// 직원명부에서 이 사람의 줄을 찾는다(등록할 때 기억한 줄, 없으면 사번).
export async function 명부줄찾기(ctx, rec) {
  const staff = await ctx.store.records('staff');
  return staff.find((s) => s.id === rec.staff_id) ?? staff.find((s) => 글(rec.emp_no) && 글(s.data.emp_no) === 글(rec.emp_no)) ?? null;
}

// ── 지금 할 일 ──
// tasks: 할 일 id 들. resend: 한 번 더 보낼 것('channel'·'dm'). rec 을 고치고(결과·기록) 이번에 한 결과만 돌려준다.
// 저장은 부르는 쪽이 한다.
export async function 지금할일하기(ctx, settings, rec, tasks, resend = []) {
  const o = settings.offboard ?? {};
  const webhook = 글(settings.company?.slack_webhook);
  const 값 = 퇴직값들(rec, settings);
  const out = {};
  const copies = [];
  const 됨 = (id, 말, extra = {}) => { out[id] = { status: 'ok', at: 지금(), by: 누구(ctx), 말, ...extra }; };
  const 실패 = (id, e) => { out[id] = { status: 'failed', at: 지금(), by: 누구(ctx), 말: e?.message || String(e) }; };

  const 채널 = async (id) => {
    const text = fill(o.channel, 값);
    const where = 글(o.channel_name) || '팀 피플 채널';
    if (webhook) { await postSlack(webhook, text); 됨(id, `${where} 에 올렸습니다.`, { where }); return; }
    copies.push({ id, text: `[${where} 에 붙여 넣기]\n${text}` });
    됨(id, `문구를 복사했습니다. 슬랙 ${where} 에 붙여 넣어 주세요.`, { where, copied: true });
  };
  const 디엠 = (id) => {
    const kind = 글(rec.notice_kind);
    const 틀 = kind ? 글(o[`dm_${kind}`]) : '';
    if (!틀) throw new Error('보낼 문안이 없습니다.');
    copies.push({ id, text: `[${값.이름} 님에게 DM]\n${fill(틀, 값)}` });
    됨(id, `「${문안이름[kind]}」 문안을 복사했습니다. 슬랙에서 ${값.이름} 님에게 DM 으로 붙여 넣어 주세요.`, { kind, copied: true });
  };

  for (const id of tasks) {
    try {
      if (id === 'roster-date') {
        const row = await 명부줄찾기(ctx, rec);
        if (!row) throw new Error('직원명부에서 이 사람을 찾지 못했습니다.');
        const 이전 = 글(row.data.left);
        await ctx.store.saveRecord('staff', row.id, { ...row.data, left: rec.leave_day });
        됨(id, `직원명부 퇴사일 칸에 ${rec.leave_day} 을(를) 적었습니다.`, { 값: rec.leave_day, 이전 });
      } else if (id === 'hub-cal') {
        const refs = [];
        for (const 일정 of 일정들(rec, settings)) {
          const item = await ctx.store.create({
            title: 일정.title, category: 'onboard', repeat_kind: 'none', start_date: 일정.date,
            lead: ctx.me?.name || '', note: `퇴사 사유: ${글(rec.reason) || '—'}`,
          });
          refs.push(item.id);
        }
        됨(id, `캘린더에 일정 ${refs.length}개를 만들었습니다.`, { refs });
      } else if (id === 'google-cal') {
        // noopener 로 열면 늘 null 이 돌아와 팝업이 막혔는지는 알 수 없다 — 안 열렸으면 상세 서랍에서 다시 하면 된다.
        window.open(구글일정주소(rec, settings), '_blank', 'noopener');
        됨(id, '구글 캘린더를 새 탭으로 열었습니다. 그 탭에서 [저장]을 눌러 주세요.');
      } else if (id === 'channel') {
        await 채널(id);
      } else if (id === 'dm') {
        디엠(id);
      } else if (id === 'modusign') {
        됨(id, `${퇴직서류받기(rec, settings)} 을(를) 내려받았습니다. 모두싸인 대량 전송에 올려 주세요.`);
      }
    } catch (e) { 실패(id, e); }
  }
  for (const id of resend) {
    try { if (id === 'channel') await 채널('channel-again'); else if (id === 'dm') 디엠('dm-again'); } catch (e) { 실패(`${id}-again`, e); }
  }

  if (copies.length) {
    const ok = await copyText(copies.map((c) => c.text).join('\n\n────────\n\n'));
    if (!ok) for (const c of copies) out[c.id] = { ...out[c.id], status: 'failed', copied: false, 말: '문구를 복사하지 못했습니다. 브라우저가 복사를 막았습니다.' };
  }
  rec.results = { ...(rec.results ?? {}), ...out };
  for (const [id, r] of Object.entries(out)) {
    const 원 = id.replace(/-again$/, '');
    적기(rec, ctx, 원, `${짧은이름[원] ?? 원}${id.endsWith('-again') ? ' 한 번 더' : ''} · ${r.status === 'ok' ? '' : '실패: '}${r.말}`);
  }
  return out;
}

// ── 그날 할 일: 조직도 ──
function 조직저장준비(org, ctx, why) {
  const people = topUnits(treeOf(org.rows)).reduce((n, r) => n + countPeople(r), 0);
  org.history = [{ at: 지금(), by: ctx.me?.name || '퇴직자', people, why }, ...(org.history ?? [])].slice(0, 50);
}

// 마지막 근무일: 본 자리 상자를 퇴직예정자 칸으로 옮기고, 겸직 상자를 지우고, 리더 자리를 비우고, 비운 칸에 결원 TO 를 만든다.
async function 조직첫째(ctx, rec) {
  const org = await loadDoc(ctx.store, 'org', ORG_ID, 빈조직);
  const 자리 = 조직자리(org.rows, rec.name);
  let 본 = 자리.본;
  if (본.length > 1) {
    본 = rec.org_row_id ? 본.filter((x) => String(x.id) === String(rec.org_row_id)) : [];
    if (!본.length) return { status: 'failed', note: '조직도에 같은 이름의 상자가 여럿이라 옮기지 못했습니다. 조직도에서 손으로 옮겨 주세요.' };
  }
  const 혼자 = 자리.본.length <= 1;
  const 겸 = 혼자 ? 자리.겸 : [];
  const 리더칸 = 혼자 ? 자리.리더칸 : [];
  if (!본.length && !리더칸.length) {
    return 자리.예정.length ? { status: 'already', note: '이미 퇴직예정자 칸에 있습니다.' } : { status: 'skipped', note: '조직도에서 이 사람을 찾지 못했습니다.' };
  }

  const undo = { moved: [], removed: [], roles: [], added: [], units: [], seats: [] };
  const byId = new Map(org.rows.map((r) => [String(r.id), r]));
  let 자리번호 = org.rows.reduce((m, r) => Math.max(m, Number(r.position) || 0), 0) + 1;
  let 예정칸 = 자리.예정칸;
  if (!예정칸) {
    예정칸 = { id: 새번호('l_leaving_'), parent_id: '', kind: 'unit', name: '퇴직예정자', role: '', job: '', title: '', dual: 0, tag: 'legend', position: 자리번호++, note: '' };
    org.rows.push(예정칸);
    undo.units.push(예정칸.id);
  }
  const 꼬리 = `${rec.leave_day} 퇴사`;
  const 빈칸들 = [];
  for (const row of 본) {
    undo.moved.push({ id: row.id, parent_id: row.parent_id, tag: row.tag, note: row.note, position: row.position });
    const 원칸 = byId.get(String(row.parent_id));
    Object.assign(row, { note: [글(원칸?.name), 꼬리].filter(Boolean).join(' · '), parent_id: 예정칸.id, tag: 'legend', position: 자리번호++ });
    if (원칸) 빈칸들.push(원칸.id);
  }
  for (const row of 겸) undo.removed.push({ ...row });
  org.rows = org.rows.filter((r) => !겸.includes(r));
  let 넣음 = 본.length > 0;
  for (const u of 리더칸) {
    undo.roles.push({ id: u.id, role: u.role });
    const info = 리더정보(u);
    u.role = '';
    if (info?.겸) continue; // 겸직 리더 자리는 비우기만 한다
    빈칸들.push(u.id);
    if (!넣음) {
      const 새줄 = { id: 새번호('p_'), parent_id: 예정칸.id, kind: 'person', name: rec.name, role: '', job: 글(rec.job_group), title: info?.직책 || 글(rec.title), dual: 0, tag: 'legend', position: 자리번호++, note: [글(u.name), 꼬리].join(' · ') };
      org.rows.push(새줄);
      undo.added.push(새줄.id);
      넣음 = true;
    }
  }

  // 결원 TO. 같은 칸에 이 사람의 결원 TO 가 이미 있으면 다시 만들지 않는다.
  const to = await loadDoc(ctx.store, 'to', TO_ID, 빈자리);
  to.seats ??= []; to.log ??= [];
  for (const unit of [...new Set(빈칸들.map(String))]) {
    if (to.seats.some((s) => String(s.unit_id) === unit && s.reason === 'left' && 글(s.left_name) === 글(rec.name))) continue;
    const seat = {
      id: 새번호('seat_'), unit_id: unit, reason: 'left', step: 'idle', left_name: rec.name, left_at: rec.leave_day, job: 글(rec.job),
      hiring_at: '', hire_id: '', join_name: '', join_at: '', note: '퇴직자 등록으로 만들어짐', updated_at: 지금(), updated_by: '퇴직자',
    };
    to.seats.push(seat);
    to.log = [{ at: 지금(), by: '퇴직자', unit_id: unit, kind: 'seat-add', before: null, after: { reason: 'left', step: 'idle' }, note: `${rec.name} 퇴직예정` }, ...to.log].slice(0, 300);
    undo.seats.push(seat.id);
  }

  조직저장준비(org, ctx, `${rec.name} 퇴직예정자 칸으로 옮김(퇴직자)`);
  await saveDoc(ctx.store, 'org', ORG_ID, org);
  if (undo.seats.length) await saveDoc(ctx.store, 'to', TO_ID, to);
  const 한일 = [본.length ? '상자를 퇴직예정자 칸으로 옮겼습니다' : '', 겸.length ? `겸직 상자 ${겸.length}개를 지웠습니다` : '', undo.roles.length ? `리더 자리 ${undo.roles.length}곳을 비웠습니다` : '', undo.seats.length ? `결원 TO ${undo.seats.length}개를 만들었습니다` : ''].filter(Boolean);
  return { status: 'done', note: `${한일.join(', ')}.`, undo };
}

// 실퇴직일: 퇴직예정자 칸에서 지운다.
async function 조직둘째(ctx, rec) {
  const org = await loadDoc(ctx.store, 'org', ORG_ID, 빈조직);
  const 자리 = 조직자리(org.rows, rec.name);
  if (!자리.예정.length) return { status: 'skipped', note: '퇴직예정자 칸에 이 사람이 없습니다.' };
  const removed = 자리.예정.map((r) => ({ ...r }));
  org.rows = org.rows.filter((r) => !자리.예정.includes(r));
  조직저장준비(org, ctx, `${rec.name} 퇴직예정자 칸에서 지움(퇴직자)`);
  await saveDoc(ctx.store, 'org', ORG_ID, org);
  return { status: 'done', note: '퇴직예정자 칸에서 지웠습니다.', undo: { removed } };
}

// 그날 할 일 하나를 하고 그 칸(slot)을 고친다. 실패해도 던지지 않는다.
export async function 그날하기(ctx, rec, id) {
  let r;
  try { r = id === 'org-first' ? await 조직첫째(ctx, rec) : await 조직둘째(ctx, rec); } catch (e) { r = { status: 'failed', note: e?.message || String(e) }; }
  rec.slots = { ...(rec.slots ?? {}), [id]: { ...(rec.slots?.[id] ?? {}), ...r, done_at: 지금() } };
  적기(rec, ctx, id, `${짧은이름[id]} · ${r.note}`);
  return r;
}

// 지울 때 [조직도 제자리 돌리기]: 옮긴 상자·지운 겸직·비운 리더 칸을 되돌리고 만든 결원 TO(아직 대기인 것)를 거둔다.
export async function 조직되돌리기(ctx, rec) {
  const 첫 = rec.slots?.['org-first']?.undo;
  const 둘 = rec.slots?.['org-second']?.undo;
  if (!첫 && !둘) return '되돌릴 조직도 변경이 없습니다.';
  const org = await loadDoc(ctx.store, 'org', ORG_ID, 빈조직);
  const 있나 = (id) => org.rows.some((r) => String(r.id) === String(id));
  for (const row of 둘?.removed ?? []) if (!있나(row.id)) org.rows.push({ ...row });
  if (첫) {
    for (const m of 첫.moved ?? []) {
      const row = org.rows.find((r) => String(r.id) === String(m.id));
      if (row && org.rows.some((r) => String(r.id) === String(m.parent_id))) Object.assign(row, { parent_id: m.parent_id, tag: m.tag ?? '', note: m.note ?? '', position: m.position });
    }
    for (const row of 첫.removed ?? []) if (!있나(row.id) && 있나(row.parent_id)) org.rows.push({ ...row });
    for (const x of 첫.roles ?? []) {
      const u = org.rows.find((r) => String(r.id) === String(x.id));
      if (u && !글(u.role)) u.role = x.role;
    }
    org.rows = org.rows.filter((r) => !(첫.added ?? []).includes(r.id));
    org.rows = org.rows.filter((r) => !((첫.units ?? []).includes(r.id) && !org.rows.some((k) => String(k.parent_id) === String(r.id))));
  }
  조직저장준비(org, ctx, `${rec.name} 제자리로 돌림(퇴직자 삭제)`);
  await saveDoc(ctx.store, 'org', ORG_ID, org);
  if ((첫?.seats ?? []).length) {
    const to = await loadDoc(ctx.store, 'to', TO_ID, 빈자리);
    const 거둘 = (to.seats ?? []).filter((s) => 첫.seats.includes(s.id) && s.step === 'idle');
    if (거둘.length) {
      to.seats = to.seats.filter((s) => !거둘.includes(s));
      to.log = [...거둘.map((s) => ({ at: 지금(), by: '퇴직자', unit_id: s.unit_id, kind: 'seat-remove', before: { reason: 'left', step: 'idle' }, after: null, note: `${rec.name} 퇴직 취소` })), ...(to.log ?? [])].slice(0, 300);
      await saveDoc(ctx.store, 'to', TO_ID, to);
    }
  }
  return '조직도를 제자리로 돌렸습니다.';
}

// ── 예약 살피기 ──
// 기다리는 그날 할 일 가운데 때가 지난 것을 한다. 돌려줌: 한 개수.
let 도는중 = false;
export async function 퇴직예약처리(ctx) {
  if (도는중 || !ctx?.canEdit) return 0;
  도는중 = true;
  let n = 0;
  try {
    const rows = await ctx.store.records('offboard');
    for (const row of rows) {
      const rec = row.data;
      let 바뀜 = false;
      for (const id of 그날할일들) {
        const s = rec.slots?.[id];
        if (s?.status !== 'waiting' || !때지남(s.때)) continue;
        await 그날하기(ctx, rec, id);
        바뀜 = true;
        n += 1;
      }
      if (바뀜) await ctx.store.saveRecord('offboard', row.id, rec);
    }
  } catch { /* 다음에 다시 살핀다 */ } finally { 도는중 = false; }
  return n;
}

// 앱이 열려 있는 동안 5분마다 살핀다(열 때도 한 번). 한 번만 건다.
let 시계 = 0;
export function 퇴직시계(ctx, onChange) {
  if (시계 || !ctx?.canEdit) return;
  const 살피기 = async () => { const n = await 퇴직예약처리(ctx); if (n) onChange?.(n); };
  시계 = setInterval(살피기, 300000);
  setTimeout(살피기, 1500);
}

// 날짜를 고쳤을 때: 기다리는 예약의 때를 새 날짜로 옮긴다.
export function 예약옮기기(rec) {
  const 새때 = { 'org-first': rec.last_day, 'org-second': rec.leave_day };
  for (const id of 그날할일들) {
    const s = rec.slots?.[id];
    if (s?.status === 'waiting' && 날꼴.test(글(새때[id]))) s.때 = `${새때[id]} ${s.때.split(' ')[1] || '17:00'}`;
  }
}

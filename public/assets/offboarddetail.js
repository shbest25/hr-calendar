// 퇴직자 상세 서랍(2026-11-23) — 목록에서 이름을 누르면 연다.
//   지금 할 일: 상태 줄(여섯) + 못 한 일만 체크 → [고른 일 하기]. 이미 보낸 채널·DM 은 「한 번 더 보내기」.
//               모두싸인은 엑셀 받기 단추.
//   그날 할 일: 시간표·상태. 기다리는 일은 [지금 하기]로 당겨서 할 수 있고, 실패한 일은 다시 할 수 있다.
//   기록 고치기: 마지막 근무일·실퇴직일·퇴사 사유·조정·DM 문안 → [고친 내용 저장]. 기다리는 예약과 만든 일정이 따라간다.
//   삭제: 확인창에서 되돌릴 일(퇴사일 칸 비우기·만든 일정 지우기·조직도 제자리)을 고른다.
import { el, replace } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, field, openDrawer, selectBox, toast } from './ui.js';
import { stamp } from './autotext.js';
import { loadDoc } from './docs.js';
import { ORG_ID } from './orgchart.js';
import {
  날꼴, 숫자글, 문장나누기, 잔여연차, 문안이름, 계획만들기, 상태보기, 다시할일, 되돌릴것, 시간표, 지금할일들, 그날할일들, 짧은이름, 결과줄들,
} from './offboardcalc.js';
import { kv, 상태점, 근거칸, 알림칸, 결과목록 } from './offboardplan.js';
import { 지금할일하기, 그날하기, 적기, 명부줄찾기, 조직되돌리기, 예약옮기기 } from './offboardrun.js';

const 글 = (v) => String(v ?? '').trim();

export async function 퇴직자상세(ctx, id, refresh) {
  let settings; let row; let org;
  try {
    const [s, rows, o] = await Promise.all([ctx.settings(), ctx.store.records('offboard'), loadDoc(ctx.store, 'org', ORG_ID, { rows: [], history: [] })]);
    settings = s; org = o;
    row = rows.find((r) => r.id === id);
  } catch (e) { toast(e.message, { error: true }); return; }
  if (!row) { toast('퇴직자 기록을 찾지 못했습니다.', { error: true }); refresh(); return; }

  let rec = row.data;
  let staffRow = await 명부줄찾기(ctx, rec).catch(() => null);
  let 최근 = null;              // 방금 한 일 { 제목, results?, 알림 } — 서랍 맨 위에 보인다
  let 미리켤 = new Set();       // 날짜를 고친 뒤 「한 번 더 보내기」 를 미리 켜 둘 것
  let 하는중 = false;
  const 읽기만 = !ctx.canEdit;
  const 몸 = el('div', {});
  const 삭제단추 = el('button', { type: 'button', class: 'btn danger', hidden: 읽기만 }, icon('trash'), '삭제');
  const 닫기단추 = el('button', { type: 'button', class: 'btn ghost' }, '닫기');

  const 계획 = () => 계획만들기({ rec, settings, staffRow, orgRows: org.rows, webhook: 글(settings.company?.slack_webhook) });
  async function 저장() {
    row = await ctx.store.saveRecord('offboard', id, rec);
    rec = row.data;
    refresh();
  }
  // 한 번에 한 가지만 한다(두 번 누르지 않게). 끝나면 다시 그린다.
  async function 하기(일) {
    if (하는중) return;
    하는중 = true;
    for (const b of 몸.querySelectorAll('button')) b.disabled = true;
    try { await 일(); } catch (e) { toast(문장나누기(e.message || '하지 못했습니다.'), { error: true }); } finally {
      하는중 = false;
      org = await loadDoc(ctx.store, 'org', ORG_ID, { rows: [], history: [] }).catch(() => org);
      staffRow = await 명부줄찾기(ctx, rec).catch(() => staffRow);
      그리기();
    }
  }

  // ── 지금 할 일 ──
  function 지금칸(plan) {
    const rows = 다시할일(plan.지금할일, rec.results);
    const 고름 = { tasks: new Set(rows.filter((r) => r.기본).map((r) => r.id)), resend: new Set(rows.filter((r) => r.다시보내기 && 미리켤.has(r.id)).map((r) => r.id)) };
    미리켤 = new Set();
    const 다시단추 = el('button', { type: 'button', class: 'btn primary', hidden: 읽기만 }, icon('refresh'), '고른 일 하기');
    const 맞추기 = () => { 다시단추.disabled = !고름.tasks.size && !고름.resend.size; };
    const li = 지금할일들.map((tid) => {
      const t = plan.지금할일.find((x) => x.id === tid);
      const r = rows.find((y) => y.id === tid);
      const res = rec.results?.[tid];
      const st = 상태보기(res?.status);
      const again = rec.results?.[`${tid}-again`];
      let 상자 = el('span', { class: 'ob-box-gap', 'aria-hidden': 'true' });
      if (r && !읽기만) {
        상자 = el('input', { type: 'checkbox', 'aria-label': `${t.label} 하기`, checked: r.할수 && 고름.tasks.has(tid), disabled: !r.할수 });
        상자.addEventListener('change', () => { if (상자.checked) 고름.tasks.add(tid); else 고름.tasks.delete(tid); 맞추기(); });
      }
      const 보내기상자 = r?.다시보내기 && !읽기만 ? (() => {
        const b = el('input', { type: 'checkbox', checked: 고름.resend.has(tid) });
        b.addEventListener('change', () => { if (b.checked) 고름.resend.add(tid); else 고름.resend.delete(tid); 맞추기(); });
        return el('label', { class: 'ht-line ob-resend' }, b, el('span', {}, '한 번 더 보내기'));
      })() : null;
      const 모두 = tid === 'modusign' && !읽기만
        ? el('button', { type: 'button', class: 'btn ghost sm', disabled: Boolean(t.blocked), onclick: () => 하기(async () => {
          const out = await 지금할일하기(ctx, settings, rec, ['modusign']);
          await 저장();
          최근 = { 제목: out.modusign.status === 'ok' ? '모두싸인 엑셀을 받았습니다.' : '모두싸인 엑셀을 받지 못했습니다.', results: out };
        }) }, icon('download'), res?.status === 'ok' ? '모두싸인 엑셀 다시 받기' : '모두싸인 엑셀 받기')
        : null;
      const 말 = 글(res?.말) || (r && !r.할수 ? r.까닭 : '') || (tid === 'modusign' ? 글(t.blocked) : '');
      return el('li', { class: 'ht-task' + (st.꼴 === 'ok' ? ' done' : '') },
        el(r && !읽기만 ? 'label' : 'div', { class: 'ht-line' }, 상자, el('span', { class: 'ht-name' }, t.label), t.where ? el('span', { class: 'ht-where' }, t.where) : null,
          el('span', { class: 'ob-right' }, 상태점(st.꼴, st.말))),
        말 ? el('p', { class: 'ob-task-msg' + (st.꼴 === 'bad' || (!res && r?.까닭) ? ' bad' : '') }, 문장나누기(말)) : null,
        again ? el('p', { class: 'ob-task-msg' }, `한 번 더 보냄 · ${상태보기(again.status).말} — ${글(again.말)}`) : null,
        보내기상자,
        모두 ? el('div', { class: 'ob-task-act' }, 모두) : null);
    });
    다시단추.addEventListener('click', async () => {
      const tasks = rows.filter((r) => r.할수 && 고름.tasks.has(r.id)).map((r) => r.id);
      const resend = rows.filter((r) => r.다시보내기 && 고름.resend.has(r.id)).map((r) => r.id);
      if (!tasks.length && !resend.length) return;
      const 이름 = (t) => rows.find((r) => r.id === t)?.label ?? t;
      const ok = await confirmBox({
        title: '고른 일을 할까요?', message: '공지·DM 처럼 되돌릴 수 없는 일이 있습니다.', confirm: '고른 일 하기',
        extra: el('ul', { class: 'ht-confirm' }, tasks.map((t) => el('li', {}, `하기 — ${이름(t)}`)), resend.map((t) => el('li', {}, `한 번 더 보내기 — ${이름(t)}`))),
      });
      if (!ok) return;
      await 하기(async () => {
        const out = await 지금할일하기(ctx, settings, rec, tasks, resend);
        await 저장();
        const 못함 = 결과줄들(out).못함;
        toast(못함 ? `${못함}개는 못 했습니다. 서랍 맨 위에서 까닭을 확인해 주세요.` : '고른 일을 했습니다.', { error: Boolean(못함) });
        최근 = { 제목: '고른 일을 했습니다. 할 일마다 어떻게 됐는지 확인하세요.', results: out, 알림: Object.values(out).some((r) => r.copied) ? ['복사한 문구가 클립보드에 있습니다. 슬랙에 붙여 넣어 주세요.'] : [] };
      });
    });
    맞추기();
    return el('section', { class: 'hire-sec' },
      el('div', { class: 'ht-head' }, el('h3', { class: 'hire-sec-title' }, '지금 할 일'), el('span', { class: 'ht-sub' }, '못 한 일을 골라 다시 할 수 있습니다. 이미 한 일은 다시 하지 않습니다.')),
      el('ul', { class: 'ht-list' }, li),
      el('div', { class: 'ob-act-bar' }, 다시단추));
  }

  // ── 그날 할 일 ──
  function 그날칸(plan) {
    const rows = 시간표(plan.그날할일, rec);
    const li = 그날할일들.map((sid) => {
      const r = rows.find((x) => x.id === sid);
      const s = rec.slots?.[sid];
      const st = 상태보기(s?.status ?? 'skipped');
      const 할수 = !읽기만 && !r.blocked && ['waiting', 'failed', 'skipped'].includes(s?.status ?? 'skipped');
      const 지금단추 = 할수 ? el('button', { type: 'button', class: 'btn ghost sm', onclick: async () => {
        const ok = await confirmBox({ title: `${r.label} — 지금 할까요?`, message: s?.status === 'waiting' ? `예약(${s.때})을 기다리지 않고 지금 조직도를 고칩니다.` : '지금 조직도를 고칩니다.', confirm: '지금 하기' });
        if (!ok) return;
        await 하기(async () => {
          rec.slots = { ...(rec.slots ?? {}), [sid]: { ...(rec.slots?.[sid] ?? {}), 때: s?.때 || r.때 } };
          const out = await 그날하기(ctx, rec, sid);
          await 저장();
          최근 = { 제목: out.status === 'done' ? '조직도를 고쳤습니다.' : '조직도를 고치지 못했습니다.', 알림: [out.note] };
        });
      } }, s?.status === 'failed' ? '다시 하기' : '지금 하기') : null;
      return el('li', { class: 'ob-slot' + (st.꼴 === 'ok' || st.꼴 === 'off' ? ' past' : '') },
        el('div', { class: 'ob-slot-when' }, el('span', { class: 'ob-slot-head' }, r.머리), el('span', { class: 'ob-slot-day' }, (s?.때 || r.때).split(' ')[0] || '—')),
        el('div', { class: 'ob-slot-what' },
          el('span', { class: 'ob-slot-label' }, r.label, ' ', 상태점(st.꼴, st.말)),
          s?.note ? el('span', { class: 'ob-slot-note' + (st.꼴 === 'bad' ? ' bad' : '') }, 문장나누기(s.note)) : null),
        지금단추);
    });
    return el('section', { class: 'hire-sec' },
      el('div', { class: 'ht-head' }, el('h3', { class: 'hire-sec-title' }, '그날 할 일'), el('span', { class: 'ht-sub' }, '그 시각이 지난 뒤 이 앱이 열려 있으면 저절로 합니다.')),
      el('ul', { class: 'ob-slots' }, li));
  }

  // ── 기록 고치기 ──
  function 고치기칸() {
    if (읽기만) return null;
    const input = (attrs) => el('input', { autocomplete: 'off', ...attrs });
    const 마지막 = input({ type: 'date', value: 글(rec.last_day) });
    const 실퇴직 = input({ type: 'date', value: 글(rec.leave_day) });
    const 사유 = input({ type: 'text', maxlength: '200', value: 글(rec.reason) });
    const 조정 = input({ type: 'number', step: '0.5', inputmode: 'decimal', placeholder: '0', value: Number(rec.adjust) ? String(rec.adjust) : '' });
    const 지금문안 = 문안이름[글(rec.notice_kind)];
    const 문안칸 = selectBox('안내 DM 문안', [['', 지금문안 ? `그대로 (${지금문안})` : '그대로'], ...Object.entries(문안이름)], '');
    const 오류 = el('p', { class: 'form-error', hidden: true });
    const 저장단추 = el('button', { type: 'button', class: 'btn primary', disabled: true }, icon('check'), '고친 내용 저장');
    const 바뀜 = () => 마지막.value !== 글(rec.last_day) || 실퇴직.value !== 글(rec.leave_day) || 글(사유.value) !== 글(rec.reason)
      || (Number(조정.value) || 0) !== (Number(rec.adjust) || 0) || (문안칸.value && 문안칸.value !== 글(rec.notice_kind));
    const 맞추기 = () => { 저장단추.disabled = !바뀜(); };
    for (const n of [마지막, 실퇴직, 사유, 조정, 문안칸]) { n.addEventListener('input', 맞추기); n.addEventListener('change', 맞추기); }
    저장단추.addEventListener('click', async () => {
      오류.hidden = true;
      const 막기 = (말) => { 오류.textContent = 말; 오류.hidden = false; };
      if (!날꼴.test(마지막.value) || !날꼴.test(실퇴직.value)) return 막기('마지막 근무일과 실퇴직일을 적어 주세요.');
      if (마지막.value > 실퇴직.value) return 막기('마지막 근무일이 실퇴직일보다 뒤일 수 없습니다.');
      if (!글(사유.value)) return 막기('퇴사 사유를 적어 주세요.');
      const 새 = { last_day: 마지막.value, leave_day: 실퇴직.value, reason: 글(사유.value), adjust: Number(조정.value) || 0, notice_kind: 문안칸.value || rec.notice_kind };
      return 하기(async () => {
        const 날바뀜 = 새.last_day !== 글(rec.last_day) || 새.leave_day !== 글(rec.leave_day);
        const 퇴직일바뀜 = 새.leave_day !== 글(rec.leave_day);
        const 알림 = [];
        Object.assign(rec, 새);
        // 잔여연차를 새 날짜·조정으로 다시 센다.
        if (staffRow) {
          const 잔여 = 잔여연차(staffRow.data, rec.leave_day, { 조정: rec.adjust, 사용직접: rec.used_direct ?? undefined });
          rec.basis = 잔여;
          rec.leave_days = 잔여?.잔여 ?? null;
        }
        if (날바뀜) {
          예약옮기기(rec);
          // 직원명부에 적은 퇴사일은 옛 날짜다 — 다시 적어야 한다.
          if (퇴직일바뀜 && rec.results?.['roster-date']?.status === 'ok') {
            rec.results['roster-date'] = { ...rec.results['roster-date'], status: 'stale', 말: `실퇴직일이 바뀌었습니다. 직원명부에는 아직 옛 날짜(${rec.results['roster-date'].값})가 적혀 있습니다.` };
            알림.push('직원명부 퇴사일은 옛 날짜입니다. 지금 할 일에서 「직원명부 퇴사일 적기」 를 다시 해 주세요.');
          }
          // 만든 캘린더 일정은 지우고 새 날짜로 다시 만든다.
          const refs = rec.results?.['hub-cal']?.refs ?? [];
          if (rec.results?.['hub-cal']?.status === 'ok' && refs.length) {
            for (const ref of refs) await ctx.store.remove(ref).catch(() => {});
            delete rec.results['hub-cal'];
            const out = await 지금할일하기(ctx, settings, rec, ['hub-cal']);
            알림.push(out['hub-cal'].status === 'ok' ? '캘린더 일정을 새 날짜로 옮겼습니다.' : `캘린더 일정을 옮기지 못했습니다: ${out['hub-cal'].말}`);
          }
          const 보낸것 = ['channel', 'dm'].filter((t) => rec.results?.[t]?.status === 'ok');
          if (보낸것.length) {
            미리켤 = new Set(보낸것);
            알림.push('이미 보낸 채널 공유·DM 은 옛 날짜입니다. 바뀐 날짜로 다시 알리려면 「한 번 더 보내기」 를 켠 채 [고른 일 하기] 를 눌러 주세요(켜 두기만 했습니다).');
          }
          if (그날할일들.some((s) => rec.slots?.[s]?.status === 'waiting')) 알림.push('기다리는 조직도 예약을 새 날짜로 옮겼습니다.');
        }
        적기(rec, ctx, 'edit', `기록 고침 · 마지막 근무일 ${rec.last_day} · 실퇴직일 ${rec.leave_day}`);
        await 저장();
        toast('저장했습니다.');
        최근 = { 제목: '기록을 고쳤습니다.', 알림 };
      });
    });
    return el('section', { class: 'hire-sec' },
      el('div', { class: 'ht-head' }, el('h3', { class: 'hire-sec-title' }, '기록 고치기'), el('span', { class: 'ht-sub' }, '날짜를 고치면 기다리는 예약·일정이 따라갑니다. 이미 한 일은 되돌리지 않습니다.')),
      오류,
      el('div', { class: 'row' }, field('마지막 근무일', 마지막), field('실퇴직일', 실퇴직)),
      el('div', { class: 'row' }, field('퇴사 사유', 사유), field('조정(일)', 조정, '빼려면 앞에 - 를 붙입니다.')),
      el('div', { class: 'row' }, field('안내 DM 문안', 문안칸, '이미 보낸 DM 은 바뀌지 않습니다.')),
      el('div', { class: 'ob-act-bar' }, 저장단추));
  }

  function 기록칸() {
    const logs = rec.log ?? [];
    if (!logs.length) return null;
    return el('section', { class: 'hire-sec' },
      el('details', { class: 'ob-logs' },
        el('summary', { class: 'hire-sec-title' }, `처리 기록 ${logs.length}줄`),
        el('ul', { class: 'hire-log' }, logs.map((l) => el('li', {}, el('span', { class: 'hire-log-at' }, stamp(l.at)), el('span', {}, l.text), el('small', {}, String(l.by || '').split('@')[0]))))));
  }

  function 그리기() {
    const plan = 계획();
    replace(몸,
      최근 ? el('section', { class: 'ob-recent' }, el('p', { class: 'ob-recent-title' }, 최근.제목), 결과목록(최근.results), 알림칸(최근.알림)) : null,
      el('div', { class: 'ob-person' },
        kv('사람', `${글(rec.name)} · ${글(rec.emp_no) || '사번 없음'}`),
        kv('소속', 글(rec.dept) || '—'),
        kv('마지막 근무일', 글(rec.last_day) || '—'),
        kv('실퇴직일', 글(rec.leave_day) || '—'),
        kv('퇴사 사유', 글(rec.reason) || '—'),
        kv('DM 문안', 문안이름[글(rec.notice_kind)] ?? '정하지 않음')),
      el('div', { class: 'ob-calc-sum' }, el('span', { class: 'ob-calc-k' }, '잔여연차'), el('strong', { class: 'ob-calc-v' }, typeof rec.leave_days === 'number' ? 숫자글(rec.leave_days) : '모름')),
      rec.basis ? el('details', { class: 'ht-pv' }, el('summary', {}, '잔여연차 근거'), 근거칸(rec.basis)) : null,
      지금칸(plan),
      그날칸(plan),
      고치기칸(),
      기록칸());
  }

  async function 지우기() {
    if (하는중) return;
    const 보기 = 되돌릴것(rec);
    const 상자 = (label, hint) => {
      const b = el('input', { type: 'checkbox', checked: true });
      return { b, node: el('li', {}, el('label', { class: 'ht-line' }, b, el('span', { class: 'ht-name' }, label)), el('p', { class: 'ob-undo-hint' }, hint)) };
    };
    const 퇴사일 = 보기.퇴사일 ? 상자('직원명부 퇴사일 칸 비우기', '이 화면이 적은 날짜가 그대로일 때만 비웁니다.') : null;
    const 일정 = 보기.일정 ? 상자('만든 캘린더 일정 지우기', '등록할 때 이 달력에 만든 퇴사 일정을 지웁니다.') : null;
    const 조직도 = 보기.조직도 ? 상자('조직도 제자리 돌리기', '옮긴 상자·지운 겸직·비운 리더 칸을 되돌리고, 생긴 결원 TO(아직 대기인 것)를 거둡니다.') : null;
    const 있음 = [퇴사일, 일정, 조직도].filter(Boolean);
    const ok = await confirmBox({
      title: `${글(rec.name)}님 기록을 지울까요?`, message: '지우면 되돌릴 수 없습니다.', confirm: '삭제', danger: true,
      extra: el('div', { class: 'ob-undo' },
        있음.length ? el('p', { class: 'ob-undo-title' }, '이미 한 일 중 함께 되돌릴 것') : null,
        있음.length ? el('ul', { class: 'ob-undo-list' }, 있음.map((x) => x.node)) : null,
        el('p', { class: 'ob-undo-hint' }, '보낸 DM·채널 공유는 되돌릴 수 없습니다.')),
    });
    if (!ok) return;
    하는중 = true;
    삭제단추.disabled = true;
    const 알림 = [];
    try {
      if (퇴사일?.b.checked) {
        const s = await 명부줄찾기(ctx, rec);
        const 적은값 = rec.results?.['roster-date']?.값;
        if (s && 글(s.data.left) === 글(적은값)) { await ctx.store.saveRecord('staff', s.id, { ...s.data, left: 글(rec.results['roster-date'].이전) }); 알림.push('직원명부 퇴사일 칸을 되돌렸습니다.'); } else 알림.push('직원명부 퇴사일이 그 사이 바뀌어 건드리지 않았습니다.');
      }
      if (일정?.b.checked) {
        for (const ref of rec.results?.['hub-cal']?.refs ?? []) await ctx.store.remove(ref).catch(() => {});
        알림.push('만든 캘린더 일정을 지웠습니다.');
      }
      if (조직도?.b.checked) 알림.push(await 조직되돌리기(ctx, rec));
      await ctx.store.deleteRecord(id);
      toast('지웠습니다.');
      refresh();
      replace(몸, el('p', { class: 'lead-muted' }, `${글(rec.name)}님 기록을 지웠습니다.`), 알림칸(알림));
      삭제단추.hidden = true;
    } catch (e) {
      toast(문장나누기(e.message || '지우지 못했습니다.'), { error: true });
      하는중 = false;
      삭제단추.disabled = false;
    }
  }

  const ctl = openDrawer({
    title: 글(rec.name) || '퇴직자',
    lead: chip(icon('open')),
    wide: true,
    body: el('div', { class: 'ob-form' }, 몸),
    footer: el('div', { style: 'display:flex;gap:8px;width:100%;align-items:center' }, 삭제단추, el('span', { class: 'spacer' }), 닫기단추),
  });
  닫기단추.addEventListener('click', () => ctl.close());
  삭제단추.addEventListener('click', 지우기);
  그리기();
}

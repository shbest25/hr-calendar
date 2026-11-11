// 평가 현황 화면(#/eval). 수습평가·주기 평가·정기 인사평가가 어디까지 왔는지 한 화면에서 보고,
// 밀린 사람을 골라 그 자리에서 리마인드 문구를 만든다(슬랙 Webhook 이 있으면 바로 보내고, 없으면 복사).
//
//   종류별 묶음 → 평가 하나 = 카드 하나 → 단계 머리줄 → 사람 한 줄(체크칸 · 이름 · 점과 선 · 상태 알약)
//   → 카드 아래 [마감 지난 사람 모두 고르기] · [리마인드 보내기 N]
//
// 평가 플랫폼이 따로 없으므로 진행 상태는 여기서 직접 적는다(관리자가 [고치기]·[대상자 추가]·사람 줄 누르기).
// 계산은 evalstatus.js 에, 자료는 records 의 'eval' 기록 하나에 있다.
import { el, replace, append } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, toast, copyText, field, selectBox, openDrawer } from './ui.js';
import { loadDoc, saveDoc } from './docs.js';
import { EVAL_ID } from './orgchart.js';
import { todayYmd, stamp, postSlack, 날짜글 } from './autotext.js';
import {
  종류묶음, 상태셈, 거르기, 고를수있나, 보낼것, 막힌까닭, 연결선, 단계풍선, 짧은날, 큰카드인가,
  상태이름, 종류이름, 알약색, 마감지난사람들, 평가정리, 리마인드글, 고를상태, 단계읽기, 최대건수,
} from './evalstatus.js';

const EMPTY = { lists: [] };
const 거르기칩 = [['all', '전체'], ['late', '마감 지남'], ['wait', '확정 대기'], ['now', '지금']];
const 고른 = new Map();   // 평가 id → Set(사람 id)
const 거름 = new Map();   // 평가 id → { q, tone }
const newId = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function 점(state) {
  if (state === 'skip') return el('span', { class: 'es-dot d-skip', 'aria-hidden': 'true' });
  const 속 = state === 'late' ? el('b', {}, '!') : (state === 'done' || state === 'now' || state === 'wait') ? el('i', {}) : null;
  return el('span', { class: `es-dot d-${state}`, 'aria-hidden': 'true' }, 속);
}
const 첫글자 = (name) => Array.from(String(name ?? '').trim())[0] ?? '';

export async function renderEval(root, ctx) {
  root.replaceChildren(el('p', { class: 'lead-muted' }, '불러오는 중'));
  let doc;
  try {
    doc = await loadDoc(ctx.store, 'eval', EVAL_ID, EMPTY);
  } catch (e) {
    root.replaceChildren(el('div', { class: 'card sec-empty' }, icon('lock'), el('p', {}, ctx.canEdit ? e.message : '평가 현황은 관리자가 로그인하면 보입니다.')));
    return;
  }
  const today = todayYmd();
  let lastRun = null;
  try { lastRun = (await ctx.store.records('run')).filter((r) => r.data.auto === 'eval-remind').sort((a, b) => (a.data.at < b.data.at ? 1 : -1))[0]?.data ?? null; } catch { lastRun = null; }

  async function save(why) {
    try {
      await saveDoc(ctx.store, 'eval', EVAL_ID, doc);
      if (why) toast(why);
      draw();
    } catch (e) { toast(e.message, { error: true }); }
  }

  function draw() {
    const lists = doc.lists.map((l) => 평가정리(l, today));
    for (const l of lists) {
      const 된다 = new Set(l.people.filter(고를수있나).map((p) => p.id));
      고른.set(l.id, new Set([...(고른.get(l.id) ?? [])].filter((id) => 된다.has(id))));
    }
    const 몸 = lists.length
      ? 종류묶음(lists).map((g) => el('section', { class: 'es-group', 'aria-label': g.label },
        el('h3', { class: 'es-gtitle' }, g.label, el('span', { class: 'es-gn' }, `${g.lists.length}개`)),
        g.lists.map((l) => 카드(l))))
      : [el('div', { class: 'card sec-empty' }, el('p', { class: 'e-title' }, '진행 중인 평가가 없습니다'), el('p', {}, ctx.canEdit ? '위의 [평가 추가] 로 첫 평가를 만들어 보세요.' : '관리자가 평가를 만들면 여기에 보입니다.'))];
    replace(root, 머리(lists), lists.length ? 범례() : null, ...몸);
  }

  // ── 맨 위 ──
  function 머리(lists) {
    const 셈들 = lists.map((l) => 상태셈(l.people));
    const 칸 = (l, c) => el('button', {
      type: 'button', class: 'es-kpi es-evtile', 'aria-label': `${l.name} 카드로 가기`,
      onclick: () => root.querySelector(`.es-card[data-id="${CSS.escape(l.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    el('span', { class: 'es-kpi-l' }, l.name, l.period ? el('small', {}, ` · ${l.period}`) : null),
    el('span', { class: 'es-kpi-n' }, String(l.people.length), el('small', {}, '명')),
    el('span', { class: 'es-evtile-sub' },
      c.late ? el('span', { class: 'k-late' }, `마감 지남 ${c.late}`) : null,
      c.wait ? el('span', { class: 'k-wait' }, `확정 대기 ${c.wait}`) : null,
      !c.late && !c.wait ? el('span', {}, '밀린 사람 없음') : null));
    return el('section', { class: 'es-hero', 'aria-label': '평가 현황 요약' },
      el('div', { class: 'es-hero-top' },
        chip(icon('steps')),
        el('div', { class: 'es-hero-title' },
          el('h2', {}, '평가 현황'),
          el('p', { class: 'es-hero-sub' }, [`${날짜글(today)} 기준`, '평가 내용(점수·등급)은 담지 않습니다', lastRun ? `마지막 리마인드 ${stamp(lastRun.at)}` : ''].filter(Boolean).join(' · '))),
        el('div', { class: 'es-hero-tools' },
          ctx.canEdit ? el('button', { type: 'button', class: 'btn primary', onclick: () => 평가서랍(null) }, icon('plus'), '평가 추가') : null)),
      lists.length ? el('div', { class: 'es-kpis' }, lists.map((l, i) => 칸(l, 셈들[i]))) : null);
  }

  function 범례() {
    return el('ul', { class: 'es-legend', 'aria-label': '단계 표시 읽는 법' },
      ['done', 'wait', 'now', 'late', 'todo', 'skip'].map((s) => el('li', {}, 점(s), 상태이름[s])));
  }

  // ── 평가 카드 ──
  function 카드(list) {
    if (!거름.has(list.id)) 거름.set(list.id, { q: '', tone: 'all' });
    const sel = 고른.get(list.id);
    const f = 거름.get(list.id);
    const big = 큰카드인가(list);
    const 셈 = 상태셈(list.people);
    const n = list.stages.length;
    const raw = doc.lists.find((l) => l.id === list.id);

    const 머리줄 = el('header', { class: 'es-chead' },
      el('div', { class: 'es-ctitle' },
        el('h3', {}, list.name),
        el('span', { class: 'es-tags' },
          (종류이름[list.kind] ?? '그 밖') === String(list.name).trim() ? null : el('span', { class: 'es-tag' }, 종류이름[list.kind] ?? '그 밖'),
          list.period ? el('span', { class: 'es-tag' }, list.period) : null,
          list.notif.blocked ? el('span', { class: 'es-tag off', title: list.notif.why || '이 평가는 알림이 꺼져 있습니다' }, icon('lock'), '알림 꺼짐') : null)),
      el('div', { class: 'es-cstats' },
        el('span', { class: 'es-count' }, el('b', {}, String(list.people.length)), '명'),
        셈.late ? el('span', { class: 'es-mini t-late' }, `마감 지남 ${셈.late}`) : null,
        셈.wait ? el('span', { class: 'es-mini t-wait' }, `확정 대기 ${셈.wait}`) : null),
      list.link && /^https?:\/\//.test(list.link) ? el('a', { class: 'btn ghost es-open', href: list.link, target: '_blank', rel: 'noopener noreferrer' }, icon('open'), '평가 플랫폼에서 열기') : null,
      ctx.canEdit ? el('button', { type: 'button', class: 'btn ghost es-open', onclick: () => 평가서랍(raw) }, icon('edit'), '고치기') : null);

    const 막힘 = list.notif.blocked ? el('p', { class: 'es-blocked' }, icon('info'), list.notif.why || '이 평가는 알림이 꺼져 있어 리마인드를 보낼 수 없습니다.') : null;
    const 더하기 = ctx.canEdit ? el('button', { type: 'button', class: 'btn ghost', onclick: () => 사람서랍(raw, null) }, icon('user-add'), '대상자 추가') : null;

    if (!list.people.length) {
      return el('article', { class: 'es-card', 'data-id': list.id, 'aria-label': list.name },
        머리줄, 막힘, el('p', { class: 'es-none' }, '진행 중인 사람이 없습니다.'),
        더하기 ? el('footer', { class: 'es-foot' }, el('span', { class: 'es-picked' }, ''), el('span', { class: 'es-foot-acts' }, 더하기)) : null);
    }

    const 줄통 = el('div', { class: 'es-rows' });
    const 보임 = el('span', { class: 'es-shown', 'aria-live': 'polite' });
    const 고른글 = el('span', { class: 'es-picked', 'aria-live': 'polite' });
    const 보내기 = el('button', { type: 'button', class: 'btn primary es-send' });
    const 전체칸 = el('input', { type: 'checkbox', class: 'es-box', 'aria-label': '보이는 사람 모두 고르기' });
    let 보이는사람 = list.people;

    function 아래줄() {
      const what = 보낼것(list, sel);
      const 까닭 = 막힌까닭(list, what.items.length);
      replace(고른글, el('b', {}, `${what.사람수}명`), ' 선택됨', what.items.length > what.사람수 ? el('span', { class: 'es-picked-sub' }, ` · 평가표 ${what.items.length}건`) : null);
      replace(보내기, icon('send'), '리마인드 보내기', what.items.length ? el('span', { class: 'es-send-n' }, String(what.items.length)) : null);
      보내기.classList.toggle('is-off', Boolean(까닭));
      보내기.title = 까닭;
      const 고를사람 = 보이는사람.filter(고를수있나);
      const 고른수 = 고를사람.filter((p) => sel.has(p.id)).length;
      전체칸.disabled = !고를사람.length || list.notif.blocked;
      전체칸.checked = 고를사람.length > 0 && 고른수 === 고를사람.length;
      전체칸.indeterminate = 고른수 > 0 && 고른수 < 고를사람.length;
    }

    function 줄(p) {
      const 된다 = 고를수있나(p) && !list.notif.blocked;
      const box = el('input', { type: 'checkbox', class: 'es-box', 'aria-label': `${p.name} 고르기` });
      box.checked = sel.has(p.id);
      box.disabled = !된다;
      const row = el('div', { class: 'es-row' + (box.checked ? ' picked' : ''), 'data-id': p.id });
      box.addEventListener('change', () => { if (box.checked) sel.add(p.id); else sel.delete(p.id); row.classList.toggle('picked', box.checked); 아래줄(); });
      const 선 = 연결선(p.steps);
      const 이유 = list.notif.blocked ? '알림이 꺼진 평가입니다' : '지금 리마인드할 평가표가 없습니다';
      const 이름 = ctx.canEdit
        ? el('button', { type: 'button', class: 'es-name es-namebtn', title: '눌러서 단계 상태 고치기', onclick: () => 사람서랍(raw, raw.people.find((x) => x.id === p.id)) }, p.name)
        : el('span', { class: 'es-name' }, p.name);
      append(row,
        el('div', { class: 'es-who', title: 된다 ? '' : 이유 },
          box,
          el('span', { class: 'es-av', 'aria-hidden': 'true' }, 첫글자(p.name)),
          el('span', { class: 'es-whotext' }, 이름, el('span', { class: 'es-sub' }, [p.org, p.sub].filter(Boolean).join(' · ')))),
        p.steps.map((s, i) => {
          const 글 = 단계풍선(list.stages[i], s) + (s.reminded_at ? ` · 리마인드 ${stamp(s.reminded_at)}` : '');
          return el('div', {
            class: `es-step s-${s.state}` + (선[i].왼 ? ' l-on' : '') + (선[i].오 ? ' r-on' : '') + (i === 0 ? ' first' : '') + (i === n - 1 ? ' last' : ''),
            role: 'img', 'aria-label': 글, title: 글,
          }, 점(s.state), (s.state === 'late' || s.state === 'now') && s.due ? el('span', { class: 'es-due' }, 짧은날(s.due)) : null);
        }),
        el('div', { class: 'es-stat' }, el('span', { class: `es-pill t-${알약색(p)}` }, p.status.text || 상태이름[알약색(p)] || '')));
      return row;
    }

    function 줄들그리기() {
      보이는사람 = big ? 거르기(list, f) : list.people;
      replace(줄통, 보이는사람.length ? 보이는사람.map(줄) : el('p', { class: 'es-none' }, '맞는 사람이 없습니다.'));
      보임.textContent = big && 보이는사람.length !== list.people.length ? `${보이는사람.length}명 보임` : '';
      아래줄();
    }
    전체칸.addEventListener('change', () => {
      for (const p of 보이는사람.filter(고를수있나)) { if (전체칸.checked) sel.add(p.id); else sel.delete(p.id); }
      줄들그리기();
    });

    let 도구 = null;
    if (big) {
      const 찾기 = el('input', { type: 'search', class: 'es-search', placeholder: '이름·조직·단계로 찾기', 'aria-label': `${list.name} 안에서 찾기`, autocomplete: 'off' });
      찾기.value = f.q;
      찾기.addEventListener('input', () => { f.q = 찾기.value; 줄들그리기(); });
      const 칩들 = el('div', { class: 'es-filters', role: 'group', 'aria-label': '상태로 거르기' });
      const 칩그리기 = () => replace(칩들, 거르기칩.map(([tone, 이름]) => el('button', {
        type: 'button', class: `es-filter f-${tone}`, 'aria-pressed': String(f.tone === tone),
        onclick: () => { f.tone = tone; 칩그리기(); 줄들그리기(); },
      }, tone === 'all' ? null : el('i', { class: `es-fdot t-${tone}` }), 이름, el('span', { class: 'es-fn' }, String(tone === 'all' ? 셈.all : 셈[tone])))));
      칩그리기();
      도구 = el('div', { class: 'es-tools' }, el('label', { class: 'es-searchbox' }, icon('search'), 찾기), 칩들, 보임);
    }

    const 머리칸 = el('div', { class: 'es-row es-hrow' },
      el('div', { class: 'es-who' }, 전체칸, el('span', { class: 'es-hlabel' }, '이름')),
      list.stages.map((s) => el('div', { class: 'es-hstep', title: s.label }, s.label)),
      el('div', { class: 'es-hstat' }, '상태'));
    const 판 = el('div', { class: 'es-scroll' }, el('div', { class: 'es-grid', style: `--n: ${Math.max(1, n)}` }, 머리칸, 줄통));

    보내기.addEventListener('click', () => 보내러(list, sel));
    const 지난것 = el('button', {
      type: 'button', class: 'btn ghost',
      onclick: () => {
        if (list.notif.blocked) { toast(막힌까닭(list, 1), { error: true }); return; }
        const ids = 마감지난사람들(list);
        let 건수 = 보낼것(list, sel).items.length;
        let 더함 = 0;
        for (const id of ids) {
          if (sel.has(id)) continue;
          const k = list.people.find((p) => p.id === id).remind.length;
          if (건수 + k > 최대건수) continue;
          sel.add(id); 건수 += k; 더함 += 1;
        }
        if (더함) 줄들그리기();
        toast(!ids.length ? '마감이 지났고 리마인드할 수 있는 사람이 없습니다' : 더함 ? `마감 지난 ${ids.length}명을 골랐습니다` : `마감 지난 ${ids.length}명은 이미 골라 두었습니다`);
      },
    }, icon('check'), '마감 지난 사람 모두 고르기');

    const 아래 = el('footer', { class: 'es-foot' }, 고른글, el('span', { class: 'es-foot-acts' }, 더하기, 지난것, 보내기));
    줄들그리기();
    return el('article', { class: 'es-card' + (big ? ' big' : ''), 'data-id': list.id, 'aria-label': list.name }, 머리줄, 막힘, 도구, 판, 아래);
  }

  // ── 보내기 ──
  async function 보내러(list, sel) {
    const what = 보낼것(list, sel);
    const 까닭 = 막힌까닭(list, what.items.length);
    if (까닭) { toast(까닭, { error: true }); return; }
    if (!ctx.canEdit) { toast('로그인한 관리자만 보낼 수 있습니다.', { error: true }); return; }
    const settings = await ctx.settings();
    const webhook = settings.company.slack_webhook;
    const 글들 = 리마인드글(list, what.items, settings.company.short);
    const 보일줄 = what.items.slice(0, 8);
    const extra = el('div', { class: 'es-confirm' },
      el('p', { class: 'es-confirm-sum' }, el('b', {}, list.name), el('br'), `${what.사람수}명 · 평가표 ${what.items.length}건 · 받는 사람 ${what.받는사람.length}명`),
      el('ul', {}, 보일줄.map((r) => el('li', {}, el('b', {}, r.name), el('span', {}, r.label), el('span', { class: 'es-to' }, icon('right'), r.to)))),
      what.items.length > 보일줄.length ? el('p', { class: 'es-confirm-more' }, `그 밖 ${what.items.length - 보일줄.length}건`) : null,
      el('p', { class: 'es-confirm-note' }, webhook ? '설정한 슬랙 Webhook 으로 받는 사람마다 한 덩이씩 올라갑니다.' : '슬랙 Webhook 이 없어 문구를 복사합니다. 슬랙 DM 에 붙여 넣어 주세요(설정 → 회사에서 Webhook 을 넣으면 바로 보냅니다).'));
    const ok = await confirmBox({ title: '리마인드를 보낼까요?', confirm: webhook ? `보내기 ${what.items.length}건` : `문구 만들기 ${what.items.length}건`, extra });
    if (!ok) return;
    const at = new Date().toISOString();
    let sent = true;
    let detail = '';
    try {
      if (webhook) {
        for (const g of 글들) await postSlack(webhook, g.text);
        detail = `슬랙 Webhook 으로 ${글들.length}명에게 보냈습니다.`;
      } else {
        sent = await copyText(글들.map((g) => g.text).join('\n\n'));
        detail = sent ? `${글들.length}명분 문구를 복사했습니다. 슬랙 DM 에 붙여 넣어 주세요.` : '복사하지 못했습니다. 다시 눌러 주세요.';
      }
    } catch (e) { sent = false; detail = e.message; }
    if (sent) {
      const raw = doc.lists.find((l) => l.id === list.id);
      for (const it of what.items) {
        const p = raw.people.find((x) => x.id === it.personId);
        if (p?.steps?.[it.step]) p.steps[it.step].reminded_at = at;
      }
      sel.clear();
    }
    try {
      await ctx.store.saveRecord('run', '', {
        auto: 'eval-remind', at, by: ctx.me.name, ok: sent, summary: `${list.name} · ${what.사람수}명 · 평가표 ${what.items.length}건`, detail,
        targets: 글들.map((g) => ({ name: g.to, ok: sent })),
      });
      if (sent) await saveDoc(ctx.store, 'eval', EVAL_ID, doc);
    } catch (e) { detail += ' (기록 저장 실패: ' + e.message + ')'; }
    lastRun = { at };
    toast(detail, { error: !sent });
    draw();
  }

  // ── 평가 고치기(관리자) ──
  function 평가서랍(list) {
    const 새것 = !list;
    const v = list ?? { id: newId('el'), name: '', kind: 'probation', period: '', link: '', notif: { blocked: false, why: '' }, stages: [], people: [] };
    const name = el('input', { type: 'text', value: v.name, placeholder: '예: 수습평가' });
    const kind = selectBox('종류', Object.entries(종류이름), v.kind);
    const period = el('input', { type: 'text', value: v.period || '', placeholder: '예: 11월, 2026 상반기' });
    const link = el('input', { type: 'url', value: v.link || '', placeholder: 'https:// 평가 시트나 폼 주소(있으면)' });
    const stages = el('textarea', { rows: 6, placeholder: '한 줄에 단계 하나\n목표 설정\n1차 평가\n피드백 면담' }, (v.stages ?? []).map((s) => s.label).join('\n'));
    const blocked = el('input', { type: 'checkbox', checked: Boolean(v.notif?.blocked) });
    const why = el('input', { type: 'text', value: v.notif?.why || '', placeholder: '왜 꺼 두었는지 한 줄' });
    const form = el('form', { class: 'd-form' },
      field('평가 이름', name),
      field('종류', kind, '종류별로 묶어 보입니다.'),
      field('기간 표시', period, '카드 이름 옆 꼬리표. 비워도 됩니다.'),
      field('바깥 링크', link),
      field('단계', stages, '줄 수가 곧 점의 수입니다. 이미 적어 둔 사람의 상태는 자리대로 남습니다.'),
      el('label', { class: 'check' }, blocked, ' 알림 끄기(리마인드를 막는다)'),
      field('끈 까닭', why));
    const del = 새것 ? null : el('button', { type: 'button', class: 'btn danger', onclick: async () => {
      if (!await confirmBox({ title: `'${v.name}' 평가를 지울까요?`, message: `대상자 ${v.people?.length ?? 0}명의 진행 상태도 함께 지워집니다.`, confirm: '지우기', danger: true })) return;
      doc.lists = doc.lists.filter((l) => l.id !== v.id);
      ctl.close();
      save('평가를 지웠습니다');
    } }, icon('trash'), '지우기');
    const ctl = openDrawer({
      title: 새것 ? '평가 추가' : `${v.name} 고치기`, lead: chip(icon('steps')), body: form,
      footer: el('div', { class: 'foot-row' }, del, el('button', { type: 'button', class: 'btn primary', onclick: () => {
        if (!name.value.trim()) { toast('평가 이름을 적어 주세요', { error: true }); return; }
        const 단계 = 단계읽기(stages.value, v.stages);
        if (!단계.length) { toast('단계를 한 줄 이상 적어 주세요', { error: true }); return; }
        const next = { ...v, name: name.value.trim(), kind: kind.value, period: period.value.trim(), link: link.value.trim(), notif: { blocked: blocked.checked, why: why.value.trim() }, stages: 단계 };
        next.people = (next.people ?? []).map((p) => ({ ...p, steps: 단계.map((_, i) => p.steps?.[i] ?? { state: 'todo', due: '', evaluator: '' }) }));
        const at = doc.lists.findIndex((l) => l.id === v.id);
        if (at >= 0) doc.lists[at] = next; else doc.lists.push(next);
        ctl.close();
        save(새것 ? '평가를 만들었습니다' : '고쳤습니다');
      } }, '저장')),
    });
    setTimeout(() => name.focus(), 50);
  }

  // ── 대상자 하나(관리자) ──
  async function 사람서랍(list, person) {
    const 새것 = !person;
    const v = person ?? { id: newId('ev'), name: '', org: '', sub: '', steps: list.stages.map(() => ({ state: 'todo', due: '', evaluator: '' })) };
    let staff = [];
    try { staff = (await ctx.store.records('staff')).map((r) => r.data).filter((s) => !s.left); } catch { staff = []; }
    const name = el('input', { type: 'text', value: v.name, placeholder: '이름' });
    const org = el('input', { type: 'text', value: v.org || '', placeholder: '소속(파트·팀)' });
    const sub = el('input', { type: 'text', value: v.sub || '', placeholder: '보조줄 — 예: 9/7 입사 · 기획' });
    const pick = staff.length ? selectBox('직원명부에서 고르기', [['', '직원명부에서 채우기(선택)'], ...staff.map((s) => [s.emp_no || s.name, `${s.name} · ${[s.dept, s.team, s.part].filter(Boolean).join(' ')}`])], '') : null;
    pick?.addEventListener('change', () => {
      const s = staff.find((x) => (x.emp_no || x.name) === pick.value);
      if (!s) return;
      name.value = s.name;
      org.value = [s.team, s.part].filter(Boolean).pop() || s.dept || '';
      sub.value = [s.joined ? `${Number(s.joined.slice(5, 7))}/${Number(s.joined.slice(8, 10))} 입사` : '', s.job_group || s.job].filter(Boolean).join(' · ');
    });
    const 단계칸 = list.stages.map((s, i) => {
      const st = v.steps?.[i] ?? { state: 'todo', due: '', evaluator: '' };
      const state = selectBox('상태', 고를상태, st.state === 'late' ? 'now' : st.state);
      const due = el('input', { type: 'date', value: st.due || '' });
      const who = el('input', { type: 'text', value: st.evaluator || '', placeholder: '평가자(비우면 본인)' });
      return { s, state, due, who, node: el('div', { class: 'es-stepedit' }, el('b', {}, `${i + 1}. ${s.label}`), state, due, who) };
    });
    const form = el('form', { class: 'd-form' },
      pick ? field('직원명부', pick) : null,
      field('이름', name), field('소속', org), field('보조줄', sub),
      el('div', { class: 'f-label', style: 'margin-top:6px' }, '단계별 상태 · 마감 · 평가자'),
      el('p', { class: 'lead-muted', style: 'margin-bottom:8px' }, '지금 작성 단계의 마감이 오늘보다 앞이면 저절로 마감 지남으로 보입니다.'),
      단계칸.map((x) => x.node));
    const del = 새것 ? null : el('button', { type: 'button', class: 'btn danger', onclick: async () => {
      if (!await confirmBox({ title: `${v.name} 을(를) 이 평가에서 뺄까요?`, confirm: '빼기', danger: true })) return;
      list.people = list.people.filter((p) => p.id !== v.id);
      ctl.close();
      save('뺐습니다');
    } }, icon('trash'), '빼기');
    const ctl = openDrawer({
      title: 새것 ? `${list.name} 대상자 추가` : `${v.name} · ${list.name}`, lead: chip(icon('user-add')), body: form,
      footer: el('div', { class: 'foot-row' }, del, el('button', { type: 'button', class: 'btn primary', onclick: () => {
        if (!name.value.trim()) { toast('이름을 적어 주세요', { error: true }); return; }
        const next = {
          ...v, name: name.value.trim(), org: org.value.trim(), sub: sub.value.trim(),
          steps: 단계칸.map((x, i) => ({ ...(v.steps?.[i] ?? {}), state: x.state.value, due: x.due.value, evaluator: x.who.value.trim() })),
        };
        const at = list.people.findIndex((p) => p.id === v.id);
        if (at >= 0) list.people[at] = next; else list.people.push(next);
        ctl.close();
        save(새것 ? '대상자를 더했습니다' : '고쳤습니다');
      } }, '저장')),
    });
    setTimeout(() => name.focus(), 50);
  }

  draw();
}

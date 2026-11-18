// 복지카드 월별 자료 화면(#/welfare). 관리자만(주민번호 칸이 든 파일을 만든다).
//
// 칸 1 「월 지급 자료」: 지난달 확정 명단 + 직원명부 + 평가 현황의 수습 통과자 → 바뀐 사람 확인 → 지급내역·한도설정 엑셀을 받고 이번 달 명단을 확정본으로 남긴다.
// 칸 2 「발급·해지 내역」: 카드사에서 받은 발급현황 두 개(직전·이번)를 카드번호로 비교 → 재무팀 공유 파일.
// 「항상 제외」: 사번으로 늘 빼는 사람 목록.
//
// 회사 허브는 구글 드라이브의 지난달 확정본 파일을 틀로 읽고 저장하지만, 서버가 없는 이 앱은 확정 명단(사번·이름·금액·이슈)을
// 기록(rec_welfare)에 남기고 파일은 내려받는다. 주민번호는 어디에도 두지 않아 한도설정의 그 칸은 비워 둔다.
// 카드번호가 든 발급현황은 비교하는 동안만 메모리에 있고, 파일을 만들면 버린다.
import { el } from './dom.js';
import { icon } from './icons.js';
import { chip, confirmBox, field, selectBox, toast } from './ui.js';
import { loadDoc, saveDoc } from './docs.js';
import { EVAL_ID } from './orgchart.js';
import { todayYmd, stamp } from './autotext.js';
import { 파일값줄 } from './xlsxread.js';
import { 엑셀받기 } from './xlsxmake.js';
import {
  사번정리, 대상월기본, 지난달, 다음달, 월글, 명부줄, 수습통과자, 명단계산, 첫명단, 최종명단, 집계, 확정줄, 한사람줄, 조직찾기, 이름찾기,
  카드읽기, 발급비교, 같은파일인가, 지급파일명, 한도파일명, 발급해지파일명, 발급현황파일명,
} from './welfarecalc.js';
import { 지급내역만들기, 한도설정만들기, 발급해지만들기, 예시발급현황 } from './welfarexl.js';

export const WELFARE_ID = 'rec_welfare';
const 빈문서 = { months: {}, exclude: [], log: [] };

// ── 화면 값(다른 화면에 갔다 와도 남는다) ──
const 월 = { ym: '', prev: null, prev출처: '', 결과: null, 고름: null, 직접: [], 오류: '', 끝글: [] };
const 발급 = { 이번: null, 이전: null, 비교: null, 오류: '', 끝글: [] };
let 제외열림 = false;
let 기록열림 = false;
let 일중 = false;

const 원 = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const 줄나눔 = (t) => String(t).split('\n').flatMap((x, i) => (i ? [el('br'), x] : [x]));

export async function renderWelfare(root, ctx) {
  const today = todayYmd();
  if (!월.ym) 월.ym = 대상월기본(today);
  root.replaceChildren(el('div', { class: 'card' }, el('p', { class: 'lead-muted' }, '불러오는 중')));
  if (!ctx.canEdit) {
    root.replaceChildren(el('div', { class: 'card' }, 머리(),
      el('p', { class: 'sec-empty' }, '복지카드 자료는 관리자가 로그인하면 만들 수 있습니다(주민번호 칸이 든 파일을 다룹니다).')));
    return;
  }

  let settings;
  let roster = [];
  let doc;
  let passed;
  try {
    settings = await ctx.settings();
    const 회사 = settings.company?.short || '우리회사';
    roster = (await ctx.store.records('staff')).map((r) => 명부줄(r.data, 회사));
    doc = await loadDoc(ctx.store, 'welfare', WELFARE_ID, 빈문서);
    doc = { ...빈문서, ...doc, months: doc.months ?? {}, exclude: doc.exclude ?? [], log: doc.log ?? [] };
    const evals = await loadDoc(ctx.store, 'eval', EVAL_ID, { lists: [] });
    passed = 수습통과자(evals.lists);
  } catch (e) {
    root.replaceChildren(el('div', { class: 'card' }, 머리(), el('p', { class: 'sec-empty' }, e.message)));
    return;
  }
  const 회사 = settings.company?.short || '우리회사';
  const 규칙 = { 기본: Number(settings.welfare?.base) || 250000, 우대: Number(settings.welfare?.senior) || 275000, 우대년수: Number(settings.welfare?.senior_years) || 3 };
  const 제외사번들 = () => new Set(doc.exclude.map((x) => 사번정리(x.emp_no)));
  const 나 = () => ctx.me?.name || ctx.me?.email || '';

  async function 기록남기기(text) {
    doc.log = [{ at: new Date().toISOString(), by: 나(), text }, ...doc.log].slice(0, 100);
    await saveDoc(ctx.store, 'welfare', WELFARE_ID, doc);
  }

  // 단추 하나가 일하는 동안 다른 단추를 막는다.
  async function 일하기(btn, 일) {
    if (일중) { toast('앞의 일이 끝난 뒤 다시 해 주세요', { error: true }); return; }
    일중 = true;
    if (btn) btn.disabled = true;
    try { await 일(); } catch (e) { toast(e.message, { error: true }); } finally { 일중 = false; if (btn) btn.disabled = false; 다시그리기(); }
  }

  // ── 칸 1: 월 지급 자료 ──
  function 불러오기() {
    Object.assign(월, { prev: null, prev출처: '', 결과: null, 고름: null, 직접: [], 오류: '', 끝글: [] });
    const 지난 = 지난달(월.ym);
    const 저장 = doc.months[지난];
    if (Array.isArray(저장) && 저장.length) {
      월.prev = 저장;
      월.prev출처 = `${월글(지난)} 확정 명단 ${저장.length}명을 기준으로 비교합니다.`;
    } else {
      월.prev = 확정줄(첫명단(roster, 지난, 규칙, 제외사번들()));
      월.prev출처 = `${월글(지난)} 확정 명단이 없어 그달 재직자 전원(${월.prev.length}명)을 지난달 명단으로 보고 비교합니다. 이번에 [두 파일 만들기]를 하면 확정 명단이 남습니다.`;
    }
    다시계산(true);
  }

  function 다시계산(처음) {
    if (!월.prev) return;
    const 제외 = 제외사번들();
    const 결과 = 명단계산({ prev: 월.prev, roster, passed, exclude: 제외, ym: 월.ym, 규칙 });
    const 있는 = new Set([...결과.계속, ...결과.빠짐, ...결과.추가, ...결과.참고].map((x) => x.사번).filter(Boolean));
    for (const 사번 of 월.직접) {
      if (있는.has(사번) || 제외.has(사번)) continue;
      const row = 한사람줄(roster, 사번, 월.ym, 규칙);
      if (row) 결과.추가.push({ 사번, 이름: row.이름, 종류: '직접', 이유: '사번 직접 추가', 체크: true, row });
    }
    월.결과 = 결과;
    if (처음 || !월.고름) {
      월.고름 = { 빠짐살림: new Set(), 추가: new Set(결과.추가.filter((x) => x.체크 && x.사번 && x.row).map((x) => x.사번)), 금액그대로: new Set() };
    }
  }

  function 직접추가(글칸) {
    const 사번 = 사번정리(글칸.value);
    if (!사번) { toast('사번을 적어 주세요', { error: true }); return; }
    const r = 월.결과;
    const 끝 = () => { 글칸.value = ''; 다시그리기(); };
    if (r.계속.some((x) => x.사번 === 사번)) { toast('이미 이번 달 명단에 있습니다'); return; }
    const 빠 = r.빠짐.find((x) => x.사번 === 사번);
    if (빠) { 월.고름.빠짐살림.add(사번); toast(`${빠.이름} 님은 빠짐 목록에 있어 빼지 않게 체크를 풀었습니다`); 끝(); return; }
    const 후 = [...r.추가, ...r.참고].find((x) => x.사번 === 사번);
    if (후) { 월.고름.추가.add(사번); toast(`${후.이름} 님은 후보 목록에 있어 체크했습니다`); 끝(); return; }
    if (제외사번들().has(사번)) { toast('항상 제외 목록에 있는 사번입니다. 먼저 그 목록에서 빼 주세요', { error: true }); return; }
    if (!한사람줄(roster, 사번, 월.ym, 규칙)) { toast('직원명부에 없는 사번입니다', { error: true }); return; }
    월.직접.push(사번);
    월.고름.추가.add(사번);
    다시계산(false);
    끝();
  }

  let 집계칸 = null;
  function 집계그리기() {
    if (!집계칸?.isConnected || !월.결과) return;
    const 셈 = 집계(최종명단(월.결과, 월.고름, 월.prev));
    집계칸.replaceChildren(
      ...셈.금액별.map((g) => el('span', {}, `${원(g.금액)} ${g.인원}명`)),
      el('b', {}, `합계 ${셈.인원}명 · ${원(셈.합계)}`));
  }
  function 체크(켬, 바꾸기, 라벨) {
    const box = el('input', { type: 'checkbox', 'aria-label': 라벨 });
    box.checked = 켬;
    box.addEventListener('change', () => { 바꾸기(box.checked); 집계그리기(); });
    return box;
  }
  const 넣고빼기 = (set, 사번) => (켬) => { if (켬) set.add(사번); else set.delete(사번); };
  const 묶음 = (제목, 수, 줄들, 설명 = '') => el('div', { class: 'wf-group' },
    el('p', { class: 'wf-group-title' }, `${제목} ${수}명`, 설명 ? el('em', {}, 설명) : null),
    el('ul', { class: 'wf-list' }, 줄들));
  const 사람줄 = (box, 이름, 사번, 뒤) => el('li', {}, el('label', { class: 'wf-row' }, box ?? el('span', { class: 'wf-nobox' }, icon('alert')),
    el('b', {}, 이름 || '(이름 없음)'), el('span', {}, 사번 || '사번 모름'), el('em', {}, 뒤)));

  function 확인화면() {
    const r = 월.결과;
    const g = 월.고름;
    const out = [];
    for (const w of r.경고) out.push(el('p', { class: 'form-error' }, ...줄나눔(w)));
    if (!r.빠짐.length && !r.추가.length && !r.금액바뀜.length) out.push(el('p', { class: 'wf-same' }, icon('check'), '지난달과 같습니다.'));
    if (r.빠짐.length) {
      out.push(묶음('빠짐', r.빠짐.length, r.빠짐.map((x) => 사람줄(
        체크(!g.빠짐살림.has(x.사번), (켬) => 넣고빼기(g.빠짐살림, x.사번)(!켬), `${x.이름} 빼기`), x.이름, x.사번, x.이유)),
      '체크를 풀면 이번 달에도 넣습니다'));
    }
    if (r.추가.length) {
      out.push(묶음('추가', r.추가.filter((x) => x.row).length, r.추가.map((x) => 사람줄(
        x.row ? 체크(g.추가.has(x.사번), 넣고빼기(g.추가, x.사번), `${x.이름} 넣기`) : null,
        x.이름, x.사번, `${x.종류} · ${x.이유}`)), '체크한 사람을 넣습니다'));
    }
    if (r.금액바뀜.length) {
      out.push(묶음('금액 바뀜', r.금액바뀜.length, r.금액바뀜.map((x) => 사람줄(
        체크(!g.금액그대로.has(x.사번), (켬) => 넣고빼기(g.금액그대로, x.사번)(!켬), `${x.이름} 새 금액`),
        x.이름, x.사번, `${원(x.전)} → ${원(x.후)}`)), '체크를 풀면 지난달 금액 그대로'));
    }
    if (r.참고.length) {
      out.push(묶음('참고', r.참고.length, r.참고.map((x) => 사람줄(
        체크(g.추가.has(x.사번), 넣고빼기(g.추가, x.사번), `${x.이름} 넣기`),
        x.이름, x.사번, x.이유)), '명단에 없는 재직자입니다. 넣을 사람만 체크해 주세요'));
    }
    const 글칸 = el('input', { type: 'text', autocomplete: 'off', placeholder: '사번(예: E1001)', 'aria-label': '직접 추가할 사번' });
    const 더하기 = el('button', { type: 'button', class: 'btn ghost', onclick: () => 직접추가(글칸) }, icon('plus'), '더하기');
    글칸.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); 직접추가(글칸); } });
    out.push(el('div', { class: 'wf-add' }, 글칸, 더하기));
    집계칸 = el('div', { class: 'wf-sum', 'aria-live': 'polite' });
    out.push(집계칸);
    queueMicrotask(집계그리기);
    const 만들기 = el('button', { type: 'button', class: 'btn primary' }, icon('download'), '두 파일 만들기');
    만들기.addEventListener('click', () => 일하기(만들기, 두파일만들기));
    out.push(el('div', { class: 'wf-acts' }, 만들기));
    return out;
  }

  async function 두파일만들기() {
    const ym = 월.ym;
    if (!월.결과) throw new Error('먼저 [불러오기]를 눌러 주세요');
    const rows = 최종명단(월.결과, 월.고름, 월.prev);
    if (!rows.length) throw new Error('이번 달 명단이 비어 있습니다');
    const 이미 = Array.isArray(doc.months[ym]) && doc.months[ym].length;
    if (이미) {
      const ok = await confirmBox({ title: `${월글(ym)} 확정 명단이 이미 있습니다`, message: `${doc.months[ym].length}명짜리 명단을 이번 것(${rows.length}명)으로 바꿀까요? 파일은 다시 내려받습니다.`, confirm: '바꾸고 만들기' });
      if (!ok) return;
    }
    const 지급 = 지급내역만들기(rows, ym);
    const 한도 = 한도설정만들기(rows, {}, ym); // 주민번호는 두지 않는다 — 칸을 비워 둔다
    엑셀받기(지급, 지급파일명(ym));
    setTimeout(() => 엑셀받기(한도.bytes, 한도파일명(ym, 회사)), 300);
    doc.months[ym] = 확정줄(rows);
    const 셈 = 집계(rows);
    const 셈글 = `${셈.금액별.map((g) => `${원(g.금액)} ${g.인원}명`).join(' / ')} / 합계 ${셈.인원}명 · ${원(셈.합계)}`;
    await 기록남기기(`${월글(ym)} 지급내역·한도설정 만듦 — ${셈.인원}명 · ${원(셈.합계)}`);
    월.끝글 = [
      `${지급파일명(ym)} — 내려받았습니다`,
      `${한도파일명(ym, 회사)} — 내려받았습니다`,
      셈글,
      `${월글(ym)} 명단 ${rows.length}명을 확정본으로 남겼습니다. 다음 달에는 이것을 기준으로 비교합니다.`,
      '주민등록번호는 이 앱에 두지 않아 한도설정의 그 칸은 비어 있습니다. 카드사에 올리기 전에 채워 주세요.',
    ];
    toast(`${월글(ym)} 파일 두 개를 내려받았습니다`);
  }

  function 월칸() {
    const 기본 = 대상월기본(today);
    const 달들 = [지난달(지난달(기본)), 지난달(기본), 기본, 다음달(기본)];
    if (!달들.includes(월.ym)) 달들.push(월.ym);
    const 고르기칸 = selectBox('대상월', 달들.sort().map((ym) => [ym, 월글(ym)]), 월.ym);
    고르기칸.addEventListener('change', () => {
      월.ym = 고르기칸.value;
      Object.assign(월, { prev: null, prev출처: '', 결과: null, 고름: null, 직접: [], 오류: '', 끝글: [] });
      다시그리기();
    });
    const 불러 = el('button', { type: 'button', class: 'btn ghost' }, icon('refresh'), '불러오기');
    불러.addEventListener('click', () => 일하기(불러, async () => 불러오기()));
    const 지난 = 지난달(월.ym);
    const 확정 = doc.months[지난];
    const 몸칸 = [
      el('div', { class: 'wf-card-head' }, el('h3', {}, '월 지급 자료'),
        el('p', { class: 'lead-muted' }, `지난달(${월글(지난)}) 확정 명단을 기준으로 바뀐 사람을 확인하고 두 파일을 만듭니다.`, el('br'),
          '품의 첨부 지급내역과 카드사에 올릴 한도설정입니다.',
          Array.isArray(확정) && 확정.length ? ` 지난달 확정 명단 ${확정.length}명이 있습니다.` : ' 지난달 확정 명단이 아직 없습니다.')),
      el('div', { class: 'wf-line' }, field('대상월', 고르기칸), 불러),
    ];
    if (월.prev출처) 몸칸.push(el('p', { class: 'lead-muted' }, 월.prev출처));
    if (월.오류) 몸칸.push(el('p', { class: 'form-error' }, 월.오류));
    if (월.결과) 몸칸.push(...확인화면());
    if (월.끝글.length) 몸칸.push(el('div', { class: 'wf-done' }, 월.끝글.map((t) => el('p', {}, t))));
    return el('section', { class: 'card wf-card' }, 몸칸);
  }

  // ── 칸 2: 발급·해지 내역 ──
  async function 파일읽기(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { rows } = await 파일값줄(file);
    const 카드 = 카드읽기(rows);
    if (!카드.length) throw new Error(`${file.name} 에서 카드를 찾지 못했습니다`);
    return { 이름: file.name, bytes, 카드 };
  }
  function 비교하기() {
    발급.비교 = null;
    발급.오류 = '';
    if (!발급.이번 || !발급.이전) return;
    if (같은파일인가(발급.이전.bytes, 발급.이번.bytes)) { 발급.오류 = '올린 두 파일이 똑같습니다.\n카드사에서 이번 발급현황을 새로 받아 올려 주세요.'; return; }
    발급.비교 = 발급비교(발급.이전.카드, 발급.이번.카드);
  }
  async function 발급만들기() {
    const 비교 = 발급.비교;
    if (!비교) throw new Error('이번 발급현황과 직전 발급현황을 먼저 골라 주세요');
    if (!비교.발급.length && !비교.옛카드.length && !비교.해지.length) {
      const 예 = await confirmBox({ title: '바뀐 카드가 없습니다', message: '발급·재발급·해지가 하나도 없습니다. 빈 표로 만들까요?', confirm: '빈 표로 만들기' });
      if (!예) return;
    }
    const 이름 = 발급해지파일명(today);
    엑셀받기(발급해지만들기(비교, 조직찾기(roster)), 이름);
    const 끝글 = [`${이름} — 내려받았습니다`, `발급 ${비교.발급.length}건 · 재발급 기존카드 ${비교.옛카드.length}건 · 해지 ${비교.해지.length}건`];
    await 기록남기기(`발급 및 해지내역 만듦 — 발급 ${비교.발급.length} · 재발급 ${비교.옛카드.length} · 해지 ${비교.해지.length}`);
    // 카드번호는 파일을 만드는 동안만 들고 있는다.
    Object.assign(발급, { 이번: null, 이전: null, 비교: null, 오류: '', 끝글 });
    toast('발급 및 해지내역을 만들었습니다');
  }
  function 파일칸(라벨, 가진것, 바꾸기) {
    const input = el('input', { type: 'file', accept: '.xlsx', 'aria-label': 라벨 });
    input.addEventListener('change', () => 일하기(null, async () => { await 바꾸기(input.files?.[0] ?? null); }));
    return el('label', { class: 'field wf-file' }, el('span', { class: 'f-label' }, 라벨), input,
      가진것 ? el('span', { class: 'f-help' }, `고른 파일: ${가진것.이름} · 카드 ${가진것.카드.length}장`) : null);
  }
  function 발급칸() {
    const 몸칸 = [
      el('div', { class: 'wf-card-head' }, el('h3', {}, '발급·해지 내역'),
        el('p', { class: 'lead-muted' }, '카드사에서 받은 발급현황 파일 두 개(직전·이번)를 올리면 카드번호로 비교합니다.', el('br'),
          `재무팀에 공유할 「${발급해지파일명(today)}」 을 만듭니다. 카드번호는 비교하는 동안만 브라우저에 있고 어디에도 남기지 않습니다.`)),
      el('div', { class: 'row' },
        파일칸('직전 발급현황', 발급.이전, async (f) => { 발급.이전 = f ? await 파일읽기(f) : null; 비교하기(); }),
        파일칸('이번 발급현황', 발급.이번, async (f) => { 발급.이번 = f ? await 파일읽기(f) : null; 비교하기(); })),
    ];
    const 예시 = el('button', { type: 'button', class: 'btn ghost sm' }, icon('download'), '눌러 볼 예시 파일 두 개 받기');
    예시.addEventListener('click', () => 일하기(예시, async () => {
      const 기준 = Object.keys(doc.months).sort().pop();
      const rows = (기준 && doc.months[기준]?.length ? doc.months[기준] : 확정줄(첫명단(roster, 월.ym, 규칙))).slice(0, 8);
      if (!rows.length) throw new Error('직원명부가 비어 있어 예시를 만들 수 없습니다');
      const 직전날 = `${지난달(지난달(today.slice(0, 7)))}-15`;
      const 이번날 = `${지난달(today.slice(0, 7))}-15`;
      const { 이전, 이번 } = 예시발급현황(rows, { 직전날, 이번날, 회사 });
      엑셀받기(이전, 발급현황파일명(직전날, 회사));
      setTimeout(() => 엑셀받기(이번, 발급현황파일명(이번날, 회사)), 300);
      toast('예시 파일 두 개를 내려받았습니다. 위 칸에 올려 보세요(카드번호는 지어낸 값입니다)');
    }));
    몸칸.push(el('p', { class: 'lead-muted wf-try' }, '카드사 파일이 없다면 ', 예시, ' — 직원명부 사람들로 만든 가짜 발급현황입니다.'));
    if (발급.오류) 몸칸.push(el('p', { class: 'form-error' }, ...줄나눔(발급.오류)));
    if (발급.비교) {
      const { 발급: 새, 옛카드, 해지 } = 발급.비교;
      몸칸.push(el('div', { class: 'wf-sum' },
        el('span', {}, `발급 ${새.length}건`), el('span', {}, `재발급 기존카드 ${옛카드.length}건`), el('span', {}, `해지 ${해지.length}건`)));
      const 이름 = (c) => `${c.소지자명}${c.제휴카드ID ? ` (${c.제휴카드ID})` : ''}`;
      몸칸.push(el('div', { class: 'wf-cmp' },
        새.length ? el('p', {}, el('b', {}, '발급 '), 새.map(이름).join(', ')) : null,
        옛카드.length ? el('p', {}, el('b', {}, '재발급 '), 옛카드.map(이름).join(', ')) : null,
        해지.length ? el('p', {}, el('b', {}, '해지 '), 해지.map(이름).join(', ')) : null));
      const 만들기 = el('button', { type: 'button', class: 'btn primary' }, icon('download'), '발급 및 해지내역 만들기');
      만들기.addEventListener('click', () => 일하기(만들기, 발급만들기));
      몸칸.push(el('div', { class: 'wf-acts' }, 만들기));
    }
    if (발급.끝글.length) 몸칸.push(el('div', { class: 'wf-done' }, 발급.끝글.map((t) => el('p', {}, t))));
    return el('section', { class: 'card wf-card' }, 몸칸);
  }

  // ── 항상 제외 ──
  function 제외칸() {
    const 이름 = 이름찾기(roster);
    const 목록 = doc.exclude;
    const 사번칸 = el('input', { type: 'text', autocomplete: 'off', placeholder: '사번(예: E0907)', 'aria-label': '항상 제외할 사번' });
    const 사유칸 = el('input', { type: 'text', autocomplete: 'off', placeholder: '사유', 'aria-label': '항상 제외 사유', maxlength: '100' });
    const 넣기 = el('button', { type: 'button', class: 'btn ghost' }, icon('plus'), '넣기');
    넣기.addEventListener('click', () => 일하기(넣기, async () => {
      const emp_no = 사번정리(사번칸.value);
      if (!emp_no) throw new Error('사번을 적어 주세요');
      if (목록.some((x) => 사번정리(x.emp_no) === emp_no)) throw new Error('이미 목록에 있는 사번입니다');
      doc.exclude = [...목록, { emp_no, reason: 사유칸.value.trim(), added_at: new Date().toISOString(), by: 나() }];
      await 기록남기기(`항상 제외에 ${emp_no} 넣음${사유칸.value.trim() ? ` — ${사유칸.value.trim()}` : ''}`);
      다시계산(false);
      toast(`${emp_no} 을(를) 항상 제외에 넣었습니다`);
    }));
    const 접이 = el('details', { class: 'wf-exclude card' },
      el('summary', {}, el('b', {}, '항상 제외'), el('span', {}, ` ${목록.length}명`)),
      el('p', { class: 'lead-muted' }, '늘 뺄 사람을 사번으로 적어 둡니다. 후보·참고 목록에도 나오지 않습니다.'),
      목록.length
        ? el('ul', { class: 'wf-list' }, 목록.map((x) => {
          const 빼기 = el('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `${x.emp_no} 빼기` }, icon('trash'), '빼기');
          빼기.addEventListener('click', () => 일하기(빼기, async () => {
            doc.exclude = doc.exclude.filter((y) => y !== x);
            await 기록남기기(`항상 제외에서 ${x.emp_no} 뺌`);
            다시계산(false);
          }));
          return el('li', {}, el('div', { class: 'wf-row wf-row-x' }, el('b', {}, 이름(x.emp_no) || '(명부에 없음)'), el('span', {}, x.emp_no),
            el('span', {}, x.reason || '사유 없음'), el('em', {}, String(x.added_at ?? '').slice(0, 10)), 빼기));
        }))
        : el('p', { class: 'lead-muted' }, '적어 둔 사번이 없습니다.'),
      el('div', { class: 'wf-add' }, 사번칸, 사유칸, 넣기));
    접이.open = 제외열림;
    접이.addEventListener('toggle', () => { 제외열림 = 접이.open; });
    return 접이;
  }

  function 기록칸() {
    const 달들 = Object.keys(doc.months).sort().reverse();
    const 접이 = el('details', { class: 'wf-exclude card' },
      el('summary', {}, el('b', {}, '확정 명단과 기록'), el('span', {}, ` 확정 ${달들.length}개월 · 기록 ${doc.log.length}건`)),
      달들.length
        ? el('ul', { class: 'wf-list' }, 달들.map((ym) => {
          const 셈 = 집계(doc.months[ym]);
          const 지우기 = el('button', { type: 'button', class: 'btn ghost sm', 'aria-label': `${월글(ym)} 확정 명단 지우기` }, icon('trash'), '지우기');
          지우기.addEventListener('click', () => 일하기(지우기, async () => {
            const ok = await confirmBox({ title: `${월글(ym)} 확정 명단을 지울까요?`, message: '그다음 달 비교의 기준이 사라집니다. 내려받은 파일은 그대로입니다.', confirm: '지우기', danger: true });
            if (!ok) return;
            delete doc.months[ym];
            await 기록남기기(`${월글(ym)} 확정 명단 지움`);
          }));
          return el('li', {}, el('div', { class: 'wf-row wf-row-x' }, el('b', {}, 월글(ym)), el('span', {}, `${셈.인원}명`), el('span', {}, 원(셈.합계)), el('em', {}), 지우기));
        }))
        : el('p', { class: 'lead-muted' }, '아직 확정한 달이 없습니다.'),
      doc.log.length ? el('ul', { class: 'hire-log' }, doc.log.slice(0, 30).map((l) => el('li', {}, el('span', { class: 'hire-log-at' }, stamp(l.at)), el('span', {}, l.text), el('small', {}, String(l.by || '').split('@')[0])))) : null);
    접이.open = 기록열림;
    접이.addEventListener('toggle', () => { 기록열림 = 접이.open; });
    return 접이;
  }

  function 다시그리기() {
    if (!root.isConnected) return;
    root.replaceChildren(el('div', { class: 'wf' }, el('div', { class: 'card' }, 머리()), 월칸(), 발급칸(), 제외칸(), 기록칸()));
  }
  다시그리기();
}

function 머리() {
  return el('div', { class: 'cal-head wf-head' }, chip(icon('card')), el('div', {},
    el('h2', {}, '복지카드'),
    el('p', { class: 'lead-muted' }, '매달 품의 첨부 지급내역·카드사 한도설정과 재무팀 공유용 발급 및 해지내역을 만듭니다.')));
}

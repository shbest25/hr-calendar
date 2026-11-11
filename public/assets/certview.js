// 증명서 발급 화면. 왼쪽에 값을 넣고 오른쪽에서 A4 로 미리 본 뒤 [PDF 내려받기].
// 내려받을 때 발급대장('cert' 기록)에 한 줄 적고 발급번호를 받아 PDF 에 찍는다(번호 없는 증명서가 나가지 않게).
// 재직·경력증명서는 직원명부에서 불러온다. 선택 칸(발령·징계·휴직·퇴사 사유·용도)은 기본이 꺼져 있다:
// 근로기준법 제39조, 근로자가 요구한 사항만 적는다.
import { el } from './dom.js';
import { icon } from './icons.js';
import { chip, openDrawer, selectBox, toast } from './ui.js';
import { 증명서모양, 칠하기, 글꼴준비, PDF만들기, 쪽, 쪽수 } from './certpaint.js';
import { 주민가림, 발급번호, 종류, 종류이름, 지원자종류 } from './certtext.js';
import { todayYmd, stamp } from './autotext.js';

const 전형들 = ['면접', '테스트 전형', '직접 적기'];

// 화면 값. 다시 그려도 남는다.
const 값 = {
  kind: 'interview', 발급일: '',
  성명: '', 생년월일: '', 용도: '증빙 제출용', 전형: '면접', 전형직접: '', 전형일: '', 지원일: '', 담당자: '',
  사람: null, 찾을말: '', 후보: [], 직원성명: '',
  소속: '', 직책: '', 주민: '', 입사일: '', 퇴사일: '', 담당업무: '',
  켬: {}, 발령: [], 징계: [], 휴직: { 구분: '', 시작: '', 종료: '' }, 퇴사사유: '', 용도칸: '',
};

let ctx0 = null;      // { store, me, settings… }
let settings = null;
let 인감 = null;      // Image | null
let 인감주소 = '';
let 판 = null;
let 칠예약 = 0;
let 뿌리 = null;
let 껍데기 = null;

const 글칸 = (name, attrs = {}) => {
  const input = el('input', { type: 'text', autocomplete: 'off', ...attrs });
  input.value = 값[name] ?? '';
  input.addEventListener('input', () => { 값[name] = input.value; 다시칠(); });
  return input;
};
const 날칸 = (name) => 글칸(name, { type: 'date' });
const 칸 = (label, control, hint = '') => el('label', { class: 'cert-field' }, el('span', {}, label), control, hint ? el('em', {}, hint) : null);

function 문서() {
  const 회사 = { name: settings.company.name, address: settings.company.address };
  const 공통 = { kind: 값.kind, 회사, 발급일: 값.발급일, 성명: 지원자종류.has(값.kind) ? 값.성명 : 값.직원성명 };
  if (지원자종류.has(값.kind)) {
    return { ...공통, 생년월일: 값.생년월일, 용도: 값.용도, 담당자: 값.담당자, 전형: 값.전형 === '직접 적기' ? 값.전형직접 : 값.전형, 전형일: 값.전형일, 지원일: 값.지원일 };
  }
  const 켬 = 값.켬;
  return {
    ...공통, 소속: 값.소속, 직책: 값.직책, 주민가림: 주민가림(값.주민), 입사일: 값.입사일, 퇴사일: 값.퇴사일, 담당업무: 값.담당업무,
    선택: { 발령: 켬.발령 ? 값.발령 : null, 징계: 켬.징계 ? 값.징계 : null, 휴직: 켬.휴직 ? 값.휴직 : null, 퇴사사유: 켬.퇴사사유 ? 값.퇴사사유 : null, 용도: 켬.용도 ? 값.용도칸 : null },
  };
}

function 다시칠() { clearTimeout(칠예약); 칠예약 = setTimeout(칠, 60); }

async function 칠() {
  if (!판?.isConnected) return;
  await 글꼴준비();
  await 인감준비();
  const 모양 = 증명서모양(문서());
  const 재기 = document.createElement('canvas').getContext('2d');
  const 수 = 쪽수(재기, 모양);
  while (판.children.length < 수) {
    판.append(el('canvas', { class: 'cert-sheet', width: String(Math.round(쪽.w * 2)), height: String(Math.round(쪽.h * 2)), 'aria-label': '증명서 미리보기' }));
  }
  while (판.children.length > 수) 판.lastElementChild.remove();
  [...판.children].forEach((c, i) => {
    const cx = c.getContext('2d');
    const 배율 = c.width / 쪽.w;
    cx.setTransform(배율, 0, 0, 배율, 0, 0);
    칠하기(cx, 모양, 인감, i);
  });
}

// 설정의 인감(data: URL)을 그림으로. 바뀌었을 때만 다시 읽는다.
function 인감준비() {
  const src = settings?.cert?.seal || '';
  if (src === 인감주소) return Promise.resolve(인감);
  인감주소 = src;
  인감 = null;
  if (!src) return Promise.resolve(null);
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => { 인감 = img; ok(img); };
    img.onerror = () => ok(null);
    img.src = src;
  });
}

// ── 직원 불러오기 ────────────────────────────────────────────────
async function 찾기(목록칸) {
  const q = 값.찾을말.trim();
  if (!q) { toast('이름을 적어 주세요', { error: true }); return; }
  목록칸.replaceChildren(el('p', { class: 'cert-note' }, '직원명부에서 찾는 중…'));
  try {
    const rows = await ctx0.store.records('staff');
    값.후보 = rows.map((r) => ({ id: r.id, ...r.data })).filter((p) => `${p.name} ${p.emp_no}`.includes(q));
  } catch (e) {
    값.후보 = [];
    목록칸.replaceChildren(el('p', { class: 'form-error' }, e.message));
    return;
  }
  후보그리기(목록칸);
}

function 후보그리기(목록칸) {
  if (!값.후보.length) { 목록칸.replaceChildren(el('p', { class: 'cert-note' }, '찾은 사람이 없습니다. [직원명부]에 먼저 올려 주세요.')); return; }
  목록칸.replaceChildren(el('ul', { class: 'cert-people' }, 값.후보.map((p) => el('li', {},
    el('button', { type: 'button', class: 'cert-person' + (값.사람?.id === p.id ? ' on' : ''), onclick: () => 불러오기(p) },
      el('b', {}, p.name),
      el('span', {}, [p.emp_no, [p.dept, p.team, p.part].filter(Boolean).join(' ')].filter(Boolean).join(' · ')),
      el('em', { class: p.left ? 'gone' : '' }, p.left ? `퇴사 ${p.left}` : '재직 중'))))));
}

function 불러오기(p) {
  Object.assign(값, {
    사람: p, 직원성명: p.name, 소속: [p.dept, p.team, p.part].filter(Boolean).join(' '), 직책: p.title || '', 주민: '',
    입사일: p.joined || '', 퇴사일: p.left || '', 담당업무: [p.job_group, p.job].filter(Boolean).join(' / '),
    발령: [{ from: p.joined || '', to: '', 소속: [p.dept, p.team, p.part].filter(Boolean).join(' '), 직책: p.title || '' }],
    징계: [], 휴직: { 구분: '', 시작: '', 종료: '' }, 퇴사사유: '', 켬: {},
  });
  // 재직 중인 사람은 재직증명서, 퇴사자는 경력증명서가 맞다 — 다른 쪽을 보고 있었으면 옮겨 준다.
  if (값.kind === 'employ' && p.left) 값.kind = 'career';
  if (값.kind === 'career' && !p.left) 값.kind = 'employ';
  다시그리기();
}

// ── 화면 ─────────────────────────────────────────────────────────
export async function renderCert(root, ctx) {
  ctx0 = ctx;
  뿌리 = root;
  root.replaceChildren(el('div', { class: 'card' }, el('p', { class: 'lead-muted' }, '불러오는 중')));
  try { settings = await ctx.settings(); } catch (e) { root.replaceChildren(el('div', { class: 'card' }, el('p', { class: 'sec-empty' }, e.message))); return; }
  값.발급일 ||= todayYmd();
  값.담당자 ||= settings.cert.manager || ctx.me?.name || '';
  껍데기 = null;
  다시그리기();
}

// 껍데기(머리줄·탭·미리보기 종이)는 한 번만 만들고, 바뀌는 것은 입력 칸뿐이다 — 탭을 눌러도 미리보기가 깜빡이지 않는다.
function 다시그리기() {
  if (!뿌리?.isConnected) return;
  if (!껍데기 || !뿌리.contains(껍데기.몸)) {
    판 = el('div', { class: 'cert-sheets' });
    const 탭들 = 종류.map(([k, label]) => el('button', { type: 'button', role: 'tab', class: 'tab', 'data-kind': k, onclick: () => { 값.kind = k; 다시그리기(); } }, label));
    const 입력칸 = el('div', { class: 'cert-form' });
    const 몸 = el('div', { class: 'cert card' },
      el('div', { class: 'cert-head' },
        el('div', { class: 'cert-title' }, chip(icon('doc')), el('div', {},
          el('h2', {}, '증명서 발급'),
          el('p', {}, '값을 넣고 오른쪽에서 확인한 뒤 PDF 로 내려받습니다. 내려받을 때 발급대장에 저절로 적힙니다.'))),
        el('div', { class: 'tabs', role: 'tablist' }, 탭들),
        el('div', { class: 'cert-tools' },
          el('button', { type: 'button', class: 'btn ghost sm', onclick: () => 대장열기() }, icon('doc'), '발급대장'),
          ctx0.canEdit ? el('button', { type: 'button', class: 'btn ghost sm', onclick: () => ctx0.openSettings('cert', () => { 껍데기 = null; renderCert(뿌리, ctx0); }) }, icon('edit'), '설정') : null)),
      el('div', { class: 'cert-body' },
        입력칸,
        el('div', { class: 'cert-preview' },
          판,
          el('div', { class: 'cert-acts' },
            ctx0.canEdit
              ? el('button', { type: 'button', class: 'btn primary', onclick: 내려받기 }, icon('download'), 'PDF 내려받기')
              : el('p', { class: 'lead-muted' }, '보기 전용입니다. 관리자가 로그인하면 발급할 수 있습니다.')))));
    껍데기 = { 몸, 탭들, 입력칸 };
    뿌리.replaceChildren(몸);
  }
  for (const b of 껍데기.탭들) {
    const on = b.dataset.kind === 값.kind;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
  껍데기.입력칸.replaceChildren(...입력들().filter(Boolean));
  다시칠();
}

function 입력들() {
  const out = [];
  if (!settings.company.address || settings.company.address.includes('○')) out.push(el('p', { class: 'cal-warn' }, icon('alert'), '회사 주소가 아직 보기 값입니다. [설정 → 회사]에서 적어 주세요.'));
  if (!settings.cert.seal) out.push(el('p', { class: 'cert-note' }, "인감이 아직 올라가 있지 않아 '(인)' 만 찍힙니다. [설정 → 증명서]에서 올릴 수 있습니다."));

  if (지원자종류.has(값.kind)) {
    const 전형 = selectBox('전형', 전형들.map((t) => [t, t]), 값.전형);
    전형.addEventListener('change', () => { 값.전형 = 전형.value; 다시그리기(); });
    out.push(
      el('div', { class: 'cert-grid' }, 칸('성명', 글칸('성명')), 칸('생년월일', 날칸('생년월일')), 칸('용도', 글칸('용도'))),
      값.kind === 'interview'
        ? el('div', { class: 'cert-grid' }, 칸('전형', 전형), 값.전형 === '직접 적기' ? 칸('전형 이름', 글칸('전형직접', { placeholder: '예: 2차 면접' })) : null, 칸('전형일', 날칸('전형일')))
        : el('div', { class: 'cert-grid' }, 칸('입사지원일', 날칸('지원일'))),
      el('div', { class: 'cert-grid' }, 칸('담당자', 글칸('담당자')), 칸('발급일', 날칸('발급일'))),
    );
    return out;
  }

  const 목록칸 = el('div', { class: 'cert-found' });
  const 찾기칸 = 글칸('찾을말', { placeholder: '이름 또는 사번', 'aria-label': '직원 이름' });
  찾기칸.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); 찾기(목록칸); } });
  if (값.후보.length) 후보그리기(목록칸);
  out.push(
    el('p', { class: 'cert-law' }, icon('info'), el('span', {}, '근로기준법 제39조 — 증명서에는 근로자가 요구한 사항만 적습니다.', el('br'), '징계·퇴사 사유 등은 본인이 요청한 경우에만 켜 주세요.')),
    el('div', { class: 'cert-search' }, 찾기칸, el('button', { type: 'button', class: 'btn ghost', onclick: () => 찾기(목록칸) }, icon('search'), '찾기')),
    목록칸,
  );
  if (!값.사람) {
    out.push(el('p', { class: 'cert-note' }, '직원을 찾아 고르면 직원명부의 값이 채워집니다. 채운 값은 모두 고칠 수 있습니다.'));
    return out;
  }
  out.push(
    el('div', { class: 'cert-grid' },
      칸('성명', 글칸('직원성명')),
      칸('주민등록번호', 글칸('주민', { placeholder: '적으면 뒤 6자리를 가려 찍습니다' }), '명부에 두지 않습니다. 이 화면에서만 씁니다'),
      칸('직책', 글칸('직책'), '비우면 줄을 넣지 않습니다')),
    el('div', { class: 'cert-grid' }, 칸('소속 부서', 글칸('소속')), 칸('담당업무', 글칸('담당업무'))),
    el('div', { class: 'cert-grid' }, 칸('입사일', 날칸('입사일')), 값.kind === 'career' ? 칸('퇴사일', 날칸('퇴사일')) : null, 칸('발급일', 날칸('발급일'))),
    선택칸들(),
  );
  return out;
}

function 켬칸(key, label, 뒤 = null) {
  const box = el('input', { type: 'checkbox' });
  box.checked = Boolean(값.켬[key]);
  box.addEventListener('change', () => { 값.켬[key] = box.checked; 다시그리기(); });
  return el('div', { class: 'cert-opt' + (box.checked ? ' on' : '') }, el('label', { class: 'cert-opt-head' }, box, el('b', {}, label)), box.checked ? 뒤 : null);
}

function 줄칸(obj, key, type, label) {
  const input = el('input', { type, 'aria-label': label, placeholder: type === 'text' ? label : '' });
  input.value = obj[key] ?? '';
  input.addEventListener('input', () => { obj[key] = input.value; 다시칠(); });
  return input;
}

function 선택칸들() {
  const 발령표 = el('div', { class: 'cert-rows' },
    값.발령.map((g, i) => el('div', { class: 'cert-row' },
      줄칸(g, 'from', 'date', '시작'), 줄칸(g, 'to', 'date', '끝'), 줄칸(g, '소속', 'text', '소속'), 줄칸(g, '직책', 'text', '직책'),
      el('button', { type: 'button', class: 'btn ghost sm', 'aria-label': '이 줄 빼기', onclick: () => { 값.발령.splice(i, 1); 다시그리기(); } }, icon('trash')))),
    el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { 값.발령.push({ from: '', to: '', 소속: '', 직책: '' }); 다시그리기(); } }, icon('plus'), '줄 더하기'),
    el('p', { class: 'cert-note' }, '명부에는 지금 소속만 있어 한 줄만 채웠습니다. 실제 이력을 직접 적어 주세요. 끝을 비우면 퇴사일·현재로 적힙니다.'));
  const 징계표 = el('div', { class: 'cert-rows' },
    값.징계.length
      ? 값.징계.map((x, i) => el('div', { class: 'cert-row' },
        줄칸(x, '날짜', 'date', '날짜'), 줄칸(x, '조치구분', 'text', '조치구분'), 줄칸(x, '사유', 'text', '사유'),
        el('button', { type: 'button', class: 'btn ghost sm', 'aria-label': '이 줄 빼기', onclick: () => { 값.징계.splice(i, 1); 다시그리기(); } }, icon('trash'))))
      : el('p', { class: 'cert-note' }, "줄이 없으면 '없음' 으로 적힙니다. 인사기록을 확인한 뒤에만 켜 주세요."),
    el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { 값.징계.push({ 날짜: '', 조치구분: '', 사유: '' }); 다시그리기(); } }, icon('plus'), '줄 더하기'));
  const 휴직칸 = el('div', { class: 'cert-row' }, 줄칸(값.휴직, '구분', 'text', '휴직 구분'), 줄칸(값.휴직, '시작', 'date', '시작'), 줄칸(값.휴직, '종료', 'date', '종료'));
  return el('div', { class: 'cert-opts' },
    el('p', { class: 'cert-opts-title' }, '선택 항목 — 본인이 요청한 것만 켜 주세요'),
    켬칸('발령', '발령 이력(부서 이동·승진)', 발령표),
    켬칸('징계', '징계 내역', 징계표),
    켬칸('휴직', '휴직 기간', 휴직칸),
    값.kind === 'career' ? 켬칸('퇴사사유', '퇴사 사유', 칸('퇴사 사유', 글칸('퇴사사유'))) : null,
    켬칸('용도', '용도', 칸('용도', 글칸('용도칸', { placeholder: '예: 금융기관 제출용' }))));
}

// ── 내려받기 ─────────────────────────────────────────────────────
function 빠진것() {
  if (!(지원자종류.has(값.kind) ? 값.성명 : 값.직원성명).trim()) return '성명을 적어 주세요';
  if (!값.발급일) return '발급일을 골라 주세요';
  if (지원자종류.has(값.kind)) {
    if (값.kind === 'interview' && !값.전형일) return '전형일을 골라 주세요';
    if (값.kind === 'interview' && 값.전형 === '직접 적기' && !값.전형직접.trim()) return '전형 이름을 적어 주세요';
    if (값.kind === 'jobseek' && !값.지원일) return '입사지원일을 골라 주세요';
    return '';
  }
  if (!값.사람) return '직원을 찾아 골라 주세요';
  if (!값.입사일) return '입사일을 적어 주세요';
  if (값.kind === 'employ' && 값.퇴사일) return '퇴사한 사람은 재직증명서를 낼 수 없습니다. 경력증명서를 쓰세요';
  if (값.kind === 'career' && !값.퇴사일) return '경력증명서는 퇴사일이 있어야 합니다(재직 중이면 재직증명서를 쓰세요)';
  if (값.켬.발령 && !값.발령.length) return '발령 이력이 비어 있습니다. 줄을 적거나 칸을 꺼 주세요';
  return '';
}

async function 내려받기(e) {
  const 막힘 = 빠진것();
  if (막힘) { toast(막힘, { error: true }); return; }
  const btn = e.currentTarget;
  btn.disabled = true;
  let 번호 = '';
  try {
    const year = 값.발급일.slice(0, 4);
    const rows = await ctx0.store.records('cert');
    번호 = 발급번호(year, rows.filter((r) => String(r.data.no ?? '').startsWith(year + '-')).length + 1);
    const 지원자 = 지원자종류.has(값.kind);
    const 켠것 = 지원자 ? [] : Object.entries(값.켬).filter(([, on]) => on).map(([k]) => k);
    await ctx0.store.saveRecord('cert', null, {
      no: 번호, kind: 값.kind, name: (지원자 ? 값.성명 : 값.직원성명).trim(), emp_no: 지원자 ? '' : (값.사람?.emp_no ?? ''),
      purpose: 지원자 ? 값.용도 : (값.켬.용도 ? 값.용도칸 : ''),
      event_date: 값.kind === 'interview' ? 값.전형일 : 값.kind === 'jobseek' ? 값.지원일 : '',
      issued: 값.발급일, options: 켠것, by: ctx0.me?.email || ctx0.me?.name || '', at: new Date().toISOString(),
    });
    const 모양 = 증명서모양({ ...문서(), 번호 });
    const blob = await PDF만들기(모양, 인감);
    const a = el('a', { href: URL.createObjectURL(blob), download: `${settings.company.short || ''}_${모양.제목}_${모양.칸?.[0]?.[1] ?? 문서().성명}.pdf` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(`발급번호 ${번호} 로 발급대장에 적었습니다`);
  } catch (err) {
    toast(번호 ? `발급번호 ${번호} 는 대장에 적혔지만 PDF 를 만들지 못했습니다: ${err.message}` : err.message, { error: true });
  } finally {
    btn.disabled = false;
  }
}

// ── 발급대장 ─────────────────────────────────────────────────────
async function 대장열기(year) {
  const y = Number(year) || Number(todayYmd().slice(0, 4));
  let rows;
  try { rows = (await ctx0.store.records('cert')).map((r) => r.data).filter((x) => String(x.no ?? '').startsWith(y + '-')); } catch (e) { toast(e.message, { error: true }); return; }
  rows.sort((a, b) => String(b.no).localeCompare(String(a.no)));
  const 해들 = selectBox('연도', [y + 1, y, y - 1, y - 2].map((n) => [String(n), `${n}년`]), String(y));
  해들.addEventListener('change', () => 대장열기(해들.value));
  openDrawer({
    title: '증명서 발급대장',
    lead: chip(icon('doc')),
    wide: true,
    body: el('div', {},
      el('div', { class: 'cert-ledger-head' }, 해들, el('span', { class: 'lead-muted' }, `${rows.length}건`)),
      rows.length
        ? el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
          el('thead', {}, el('tr', {}, ['발급번호', '종류', '성명', '용도', '해당 날짜', '넣은 항목', '발급자', '발급 시각'].map((h) => el('th', {}, h)))),
          el('tbody', {}, rows.map((x) => el('tr', {},
            el('td', {}, x.no), el('td', {}, 종류이름[x.kind] ?? x.kind),
            el('td', {}, x.emp_no ? `${x.name} (${x.emp_no})` : x.name),
            el('td', {}, x.purpose || '-'), el('td', {}, x.event_date || '-'),
            el('td', {}, (x.options ?? []).join(', ') || '-'),
            el('td', {}, String(x.by || '').split('@')[0]), el('td', {}, stamp(x.at)))))))
        : el('p', { class: 'cert-note' }, '이 해에 발급한 증명서가 없습니다.')),
  });
}

// 시작점. 사이드바와 본문 틀을 만들고, 해시 주소가 바뀔 때마다 본문만 갈아 끼운다.
import { el } from './dom.js';
import { icon } from './icons.js';
import { hashOf, viewOf } from './route.js';
import { detectStore } from './store.js';
import { renderCalendar } from './calview.js';
import { renderAuto, AUTOS } from './autoview.js';
import { renderHire, upcomingHires } from './hireview.js';
import { renderCert } from './certview.js';
import { renderStaff } from './staffview.js';
import { renderEval } from './evalview.js';
import { renderOrg } from './orgview.js';
import { renderTo } from './toview.js';
import { openSettings } from './settingsview.js';
import { loadDoc } from './docs.js';
import { ORG_ID, TO_ID, treeOf, topUnits, countPeople, 세기, 합계 } from './orgchart.js';
import { field, openDrawer, toast } from './ui.js';
import { todayYmd, thisMonth, 요일글 } from './autotext.js';

const root = document.getElementById('app');
const store = await detectStore();
const me = await store.me().catch(() => ({ email: '', name: '사용자' }));

// 화면들이 같이 쓰는 것: 저장소·로그인한 사람·고칠 수 있는지·설정.
const ctx = {
  store,
  me,
  canEdit: store.kind !== 'supabase' || Boolean(me.can_edit),
  _settings: null,
  async settings() {
    if (!this._settings) this._settings = await store.settings();
    return this._settings;
  },
  async saveSettings(next) {
    this._settings = await store.saveSettings(next);
    return this._settings;
  },
  // 설정 서랍을 연다. after 는 저장한 뒤 화면을 다시 그리는 함수.
  async openSettings(tab = 'company', after = null) {
    try {
      openSettings({ settings: await this.settings(), tab, onSave: async (next) => { await this.saveSettings(next); after?.(); } });
    } catch (e) { toast(e.message, { error: true }); }
  },
};

// 사이드바. 묶음(자동화)은 작은 제목으로 가른다.
const NAV = [
  ['home', '홈', 'home'],
  ['calendar', '캘린더', 'calendar'],
  ['staff', '직원명부', 'people'],
  ['eval', '평가 현황', 'steps'],
  ['org', '조직도', 'sitemap'],
  ['to', 'TO표', 'table'],
  null,
  ['auto', '자동화 전체', 'app'],
  ['hire', '신규 입사자', 'user-add'],
  ['cert', '증명서 발급', 'doc'],
  ['auto:payroll-notice', '급여 공지 보내기', 'wallet'],
  ['auto:longservice-mail', '장기근속 케어 메일', 'heart'],
];
const TITLE = {
  home: '홈', calendar: '캘린더', staff: '직원명부', eval: '평가 현황', org: '조직도', to: 'TO표', auto: '자동화', hire: '신규 입사자', cert: '증명서 발급',
  'auto:payroll-notice': '급여 공지 보내기', 'auto:longservice-mail': '장기근속 케어 메일',
};
const links = {};

// 모드별 문구. local = 이 브라우저에만, supabase = 모두가 같은 달력(관리자만 수정), remote = Cloudflare 서버.
const MODE = {
  local: {
    badge: store.fallback ? '체험 모드 · 서버에 연결하지 못해 이 브라우저에만 저장됩니다' : '체험 모드 · 이 브라우저에만 저장됩니다',
    title: '지금은 체험 모드',
    text: store.fallback
      ? '공유 서버(Supabase)에 연결하지 못했습니다(' + store.fallback + '). 무료 프로젝트는 오래 안 쓰면 잠드니 Supabase 대시보드에서 깨운 뒤 새로고침해 보세요. 그동안은 이 브라우저에만 저장됩니다.'
      : '누구나 자유롭게 눌러 볼 수 있고, 바꾼 내용은 이 브라우저에만 남습니다. 모두가 같은 달력을 보게 하려면 assets/config.js 에 Supabase 주소와 키를 넣으세요(README 참고).',
  },
  supabase: {
    badge: me.can_edit ? '공유 모드 · 로그인됨, 바꾸면 모두에게 보입니다' : '공유 모드 · 보기 전용 (관리자만 수정)',
    title: '지금은 공유 모드',
    text: me.can_edit
      ? '일정은 Supabase 에 저장되고, 이 주소로 들어오는 사람 모두 같은 달력을 봅니다. 지금은 로그인되어 있어 추가·수정·완료 체크와 자동화를 쓸 수 있습니다.'
      : '일정은 Supabase 에 저장되고, 누구나 볼 수 있습니다. 추가·수정·완료 체크와 자동화(입사자·직원명부·증명서)는 왼쪽 아래 [관리자 로그인]으로 들어온 사람만 할 수 있습니다.',
  },
  remote: {
    badge: '서버 저장 모드 · 모두가 같은 달력을 봅니다',
    title: '지금은 서버 저장 모드',
    text: '일정은 Cloudflare D1 에 저장됩니다. 같은 주소로 들어오는 사람 모두 같은 달력을 봅니다.',
  },
}[store.kind] || { badge: '', title: '', text: '' };

// ---------- 로그인(공유 모드만) ----------
function loginDrawer() {
  const email = el('input', { type: 'email', placeholder: 'name@example.com', autocomplete: 'email', required: true });
  const error = el('p', { class: 'form-error', hidden: true });
  const submit = async () => {
    const value = email.value.trim();
    if (!value) { error.hidden = false; error.textContent = '이메일을 적어 주세요.'; return; }
    button.disabled = true;
    try {
      await store.login(value);
      drawer.close();
      toast('로그인 링크를 메일로 보냈습니다. 메일함을 확인해 주세요.');
    } catch (e) {
      error.hidden = false;
      error.textContent = e.message;
      button.disabled = false;
    }
  };
  const button = el('button', { type: 'button', class: 'btn primary', onclick: submit }, '로그인 링크 보내기');
  email.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const drawer = openDrawer({
    title: '관리자 로그인',
    lead: el('span', { class: 'chip' }, icon('open')),
    body: el('div', {},
      el('p', { class: 'lead-muted', style: 'margin-bottom:14px' }, '비밀번호 대신 메일로 받은 링크를 눌러 들어옵니다. Supabase 에 등록된 관리자 이메일만 됩니다.'),
      field('이메일', email),
      error),
    footer: button,
  });
  setTimeout(() => email.focus(), 50);
}

function sideFoot() {
  if (store.kind !== 'supabase') {
    return el('div', { class: 'side-foot' },
      el('span', { class: 'avatar' }, (me.name || '?').slice(0, 1)),
      el('span', {}, me.name || '사용자', me.email ? el('small', { style: 'display:block;opacity:.6' }, me.email) : null));
  }
  if (me.can_edit) {
    return el('div', { class: 'side-foot' },
      el('span', { class: 'avatar' }, (me.name || '?').slice(0, 1)),
      el('span', { class: 'side-who' }, me.name, el('small', {}, me.email)),
      el('button', { type: 'button', class: 'side-act', onclick: async () => { await store.logout(); location.reload(); } }, '로그아웃'));
  }
  return el('div', { class: 'side-foot' },
    el('span', { class: 'avatar dim' }, '?'),
    el('span', { class: 'side-who' }, '방문자', el('small', {}, '보기 전용')),
    el('button', { type: 'button', class: 'side-act', onclick: loginDrawer }, '관리자 로그인'));
}

const side = el('aside', { class: 'side' },
  el('div', { class: 'brand' }, 'HR 캘린더', el('small', {}, '인사파트 업무 달력 · 자동화')),
  el('nav', { class: 'nav' }, NAV.map((entry) => {
    if (!entry) return el('div', { class: 'nav-group' }, '자동화');
    const [view, label, ic] = entry;
    links[view] = el('a', { class: 'nav-btn' + (view.startsWith('auto:') ? ' sub' : ''), href: hashOf(view) }, icon(ic), label);
    return links[view];
  })),
  sideFoot());

const pageTitle = el('h1', {}, '');
const board = el('div', { class: 'board' });
const main = el('main', { class: 'main' },
  el('div', { class: 'topbar' }, pageTitle, el('span', { class: 'mode-badge' }, MODE.badge)),
  board);

root.replaceChildren(el('div', { class: 'shell' }, side, main));

// 다른 탭에서 로그인하거나 메일 링크로 돌아오면 화면을 처음부터 다시 그린다.
if (store.kind === 'supabase') store.onAuthChange(() => location.reload());
if (location.hash.startsWith('#error')) {
  const why = new URLSearchParams(location.hash.slice(1)).get('error_description') || '로그인 링크가 만료되었거나 올바르지 않습니다.';
  history.replaceState(null, '', location.pathname + location.search + '#/calendar');
  setTimeout(() => toast(why), 300);
}

// ---------- 홈 ----------
async function renderHome(target) {
  const today = todayYmd();
  const todayCard = el('div', { class: 'card home-today' },
    el('div', { class: 'home-date' }, el('b', {}, `${Number(today.slice(5, 7))}.${Number(today.slice(8, 10))}`), el('span', {}, 요일글(today))),
    el('div', { class: 'home-todo' }, el('h3', {}, '오늘 할 일'), el('p', { class: 'lead-muted' }, '불러오는 중')),
    el('a', { class: 'btn ghost', href: hashOf('calendar') }, icon('calendar'), '캘린더 열기'));
  const hireCard = el('div', { class: 'card' }, el('h3', {}, '입사 예정'), el('p', { class: 'lead-muted' }, '불러오는 중'));
  const orgCard = el('div', { class: 'card home-org' }, el('h3', {}, '인원 · TO'), el('p', { class: 'lead-muted' }, '불러오는 중'));
  target.replaceChildren(
    todayCard,
    orgCard,
    el('div', { class: 'home-grid' },
      el('div', { class: 'card home-autos' },
        el('div', { class: 'home-autos-head' }, el('h3', {}, '자동화'), el('a', { href: hashOf('auto') }, '전체 보기')),
        el('div', { class: 'home-auto-grid' },
          el('a', { class: 'home-auto', href: hashOf('hire') }, el('span', { class: 'chip' }, icon('user-add')), el('span', {}, '신규 입사자'), icon('right')),
          ...AUTOS.map((a) => el('a', { class: 'home-auto', href: hashOf('auto:' + a.id) }, el('span', { class: 'chip' }, icon(a.icon)), el('span', {}, a.title), icon('right'))),
          el('a', { class: 'home-auto', href: hashOf('cert') }, el('span', { class: 'chip' }, icon('doc')), el('span', {}, '증명서 발급'), icon('right')))),
      hireCard,
      el('div', { class: 'card' },
        el('h3', {}, '어떻게 쓰나요'),
        el('p', {}, '① 캘린더에 급여·세무·복지 같은 반복 업무를 올려 두고 한 일은 눌러 완료 체크합니다. ② 신규 입사자는 등록하면 일정·공지·안내 메일을 한 자리에서 처리합니다. ③ 급여 공지·장기근속 메일은 미리보기를 본 뒤 실행합니다. ④ 증명서는 값을 넣고 PDF 로 내려받으면 발급대장에 적힙니다.')),
      el('div', { class: 'card' }, el('h3', {}, MODE.title), el('p', {}, MODE.text))));

  // 오늘 기한인 일정
  try {
    const data = await store.month(thisMonth());
    const items = data.items.filter((x) => x.due === today);
    const box = todayCard.querySelector('.home-todo');
    const colorOf = (key) => data.categories.find((c) => c.key === key)?.color ?? '#616161';
    box.replaceChildren(el('h3', {}, '오늘 할 일'),
      items.length
        ? el('ul', { class: 'home-list' }, items.map((it) => el('li', { class: it.done ? 'done' : '' }, el('span', { class: 'cal-dot', style: 'background:' + colorOf(it.category) }), el('span', {}, it.title), it.lead ? el('small', {}, it.lead) : null)))
        : el('p', { class: 'lead-muted' }, '오늘 기한인 일정이 없습니다.'));
  } catch (e) {
    todayCard.querySelector('.home-todo').replaceChildren(el('h3', {}, '오늘 할 일'), el('p', { class: 'lead-muted' }, e.message));
  }
  // 입사 예정자
  try {
    const rows = await store.records('hire');
    const soon = upcomingHires(rows, today).slice(0, 6);
    hireCard.replaceChildren(el('h3', {}, '입사 예정'),
      soon.length
        ? el('ul', { class: 'home-list' }, soon.map((h) => el('li', {}, el('b', { class: 'home-dday' + (h.when.includes('지남') ? ' past' : '') }, h.when), el('span', {}, h.name), el('small', {}, `${h.dept} · ${h.start_date}`))))
        : el('p', { class: 'lead-muted' }, '입사 예정자가 없습니다.'),
      el('a', { class: 'btn ghost sm', href: hashOf('hire'), style: 'margin-top:10px' }, '신규 입사자 열기'));
  } catch (e) {
    hireCard.replaceChildren(el('h3', {}, '입사 예정'), el('p', { class: 'lead-muted' }, ctx.canEdit ? e.message : '관리자가 로그인하면 보입니다.'));
  }
  // 인원 카드: 전사 합계와 맨 위 조직마다 한 칸. TO 숫자는 관리자만(TO 기록을 못 읽으면 사람 수만).
  try {
    const org = await loadDoc(store, 'org', ORG_ID, { rows: [] });
    const tree = treeOf(org.rows);
    const tops = topUnits(tree);
    let counts = null;
    try { counts = 세기(tree, (await loadDoc(store, 'to', TO_ID, { seats: [] })).seats); } catch { counts = null; }
    const c = (id) => counts?.get(String(id));
    const toLine = (x, id) => (x ? el('a', { class: 'home-to', href: hashOf('to') + (id ? `?tab=${id}` : '') },
      el('span', {}, '최종 TO', el('b', {}, String(x.최종))), el('span', {}, '잔여', el('b', { class: 'rest' }, String(x.잔여))),
      x.채용중 ? el('span', {}, '채용 중', el('b', {}, String(x.채용중))) : null, x.입사예정 ? el('span', {}, '입사 예정', el('b', {}, String(x.입사예정))) : null) : null);
    const total = tops.reduce((n, r) => n + countPeople(r), 0);
    const all = counts ? 합계(tops.map((r) => ({ depth: 0, c: c(r.id) }))) : null;
    orgCard.replaceChildren(
      el('div', { class: 'home-org-head' }, el('h3', {}, '인원 · TO'), el('a', { href: hashOf('org') }, '조직도 보기')),
      tops.length
        ? el('div', { class: 'home-org-grid' },
          el('a', { class: 'home-org-one all', href: hashOf('org') }, el('span', { class: 'n' }, el('b', {}, String(total)), '명'), el('span', { class: 'l' }, '전사 통합'), toLine(all, '')),
          tops.map((r) => el('a', { class: 'home-org-one', href: hashOf('org') + `?tab=${r.id}` }, el('span', { class: 'n' }, el('b', {}, String(countPeople(r))), '명'), el('span', { class: 'l' }, r.name), toLine(c(r.id), r.id))))
        : el('p', { class: 'lead-muted' }, '조직도가 아직 비어 있습니다. [조직도] 에서 만들어 보세요.'));
  } catch (e) {
    orgCard.replaceChildren(el('h3', {}, '인원 · TO'), el('p', { class: 'lead-muted' }, ctx.canEdit ? e.message : '관리자가 로그인하면 보입니다.'));
  }
}

function paint() {
  const view = viewOf(location.hash);
  for (const [v, a] of Object.entries(links)) a.classList.toggle('on', v === view);
  const title = TITLE[view] ?? '홈';
  pageTitle.textContent = title;
  document.title = title + ' · HR 캘린더';
  if (view === 'calendar') renderCalendar(board, store);
  else if (view === 'staff') renderStaff(board, ctx);
  else if (view === 'hire') renderHire(board, ctx);
  else if (view === 'cert') renderCert(board, ctx);
  else if (view === 'eval') renderEval(board, ctx);
  else if (view === 'org') renderOrg(board, ctx);
  else if (view === 'to') renderTo(board, ctx);
  else if (view === 'auto') renderAuto(board, ctx, '');
  else if (view.startsWith('auto:')) renderAuto(board, ctx, view.slice(5));
  else renderHome(board);
}

window.addEventListener('hashchange', paint);
paint();

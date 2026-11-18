// 시작점. 사이드바와 본문 틀을 만들고, 해시 주소가 바뀔 때마다 본문만 갈아 끼운다.
import { el } from './dom.js';
import { icon } from './icons.js';
import { hashOf, viewOf } from './route.js';
import { detectStore } from './store.js';
import { renderCalendar } from './calview.js';
import { renderAuto } from './autoview.js';
import { renderHire } from './hireview.js';
import { renderCert } from './certview.js';
import { renderStaff } from './staffview.js';
import { renderEval } from './evalview.js';
import { renderOrg } from './orgview.js';
import { renderTo } from './toview.js';
import { renderWelfare } from './welfareview.js';
import { renderHome } from './homeview.js';
import { openSettings } from './settingsview.js';
import { 예약시계 } from './autobook.js';
import { field, openDrawer, toast } from './ui.js';

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
  ['welfare', '복지카드', 'card'],
  ['auto:payroll-notice', '급여 공지 보내기', 'wallet'],
  ['auto:longservice-mail', '장기근속 케어 메일', 'heart'],
];
const TITLE = {
  home: '홈', calendar: '캘린더', staff: '직원명부', eval: '평가 현황', org: '조직도', to: 'TO표', auto: '자동화', hire: '신규 입사자', cert: '증명서 발급', welfare: '복지카드',
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
  else if (view === 'welfare') renderWelfare(board, ctx);
  else if (view === 'auto') renderAuto(board, ctx, '');
  else if (view.startsWith('auto:')) renderAuto(board, ctx, view.slice(5));
  else renderHome(board, ctx, { mode: MODE });
}

window.addEventListener('hashchange', paint);
paint();
// 자동화 예약은 서버 없이 브라우저가 열려 있을 때 때가 되면 나간다(autobook.js). 바뀐 것이 있으면 알리고 홈이면 다시 그린다.
예약시계(ctx, (n) => {
  toast(`예약 ${n}건을 처리했습니다. 홈의 자동화 현황에서 확인해 주세요.`);
  if (viewOf(location.hash) === 'home') paint();
});

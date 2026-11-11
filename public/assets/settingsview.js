// 자동화 설정 서랍. 회사 정보·급여 공지·장기근속·신규 입사자·증명서 문구를 한 곳에서 고친다.
// 값은 'settings' 기록 하나에 저장된다(model.js 의 DEFAULT_SETTINGS 가 빈 칸을 채운다).
import { el } from './dom.js';
import { icon } from './icons.js';
import { chip, field, iconButton, openDrawer, toast } from './ui.js';

const TABS = [
  ['company', '회사'],
  ['payroll', '급여 공지'],
  ['longservice', '장기근속'],
  ['hire', '신규 입사자'],
  ['cert', '증명서'],
];

const text = (obj, key, attrs = {}) => {
  const node = el('input', { type: 'text', autocomplete: 'off', ...attrs });
  node.value = obj[key] ?? '';
  node.addEventListener('input', () => { obj[key] = node.value; });
  return node;
};
const area = (obj, key, rows = 8) => {
  const node = el('textarea', { rows: String(rows), spellcheck: 'false', class: 'mono' });
  node.value = obj[key] ?? '';
  node.addEventListener('input', () => { obj[key] = node.value; });
  return node;
};
const lines = (obj, key, rows = 4, help = '한 줄에 하나') => {
  const node = el('textarea', { rows: String(rows), spellcheck: 'false' });
  node.value = (obj[key] ?? []).join('\n');
  node.addEventListener('input', () => { obj[key] = node.value.split('\n').map((s) => s.trim()).filter(Boolean); });
  return field('', node, help);
};
const keys = (pairs) => el('ul', { class: 'auto-keys' }, pairs.map(([k, v]) => el('li', {}, el('code', {}, k), el('span', {}, v))));

function companyPane(s) {
  return el('div', { class: 'set-pane' },
    el('p', { class: 'lead-muted' }, '증명서와 모든 문구에 쓰이는 회사 정보입니다.'),
    el('div', { class: 'row' }, field('정식 회사명', text(s, 'name', { placeholder: '㈜우리회사' })), field('짧은 이름', text(s, 'short', { placeholder: '우리회사' }))),
    field('주소', text(s, 'address'), '증명서 아래와 입사 안내 메일에 찍힙니다.'),
    el('div', { class: 'row' }, field('인사팀 이름', text(s, 'hr_team')), field('담당자 연락처', text(s, 'contact_phone'))),
    field('인사팀 메일', text(s, 'hr_mail', { type: 'email', placeholder: 'hr@example.com' }), '안내 메일의 회신 주소로 안내합니다.'),
    field('슬랙 Incoming Webhook', text(s, 'slack_webhook', { placeholder: 'https://hooks.slack.com/services/…' }),
      '적으면 [실행] 때 슬랙에 바로 올립니다. 비우면 문구를 복사해 직접 붙여 넣습니다. Webhook 은 슬랙 앱 설정 → Incoming Webhooks 에서 만듭니다.'));
}

function payrollPane(s) {
  let rows = (s.corps ?? []).map((c) => ({ ...c }));
  s.corps = rows;
  const list = el('div', { class: 'cat-list' });
  const draw = () => {
    list.replaceChildren(...rows.map((row) => el('div', { class: 'auto-corp' },
      el('div', { class: 'row' },
        field('법인 이름', text(row, 'label', { placeholder: '본사' })),
        field('코드(영문)', text(row, 'key', { placeholder: 'main' })),
        field('올릴 채널', text(row, 'channel', { placeholder: '#전사공지' })),
        el('span', { style: 'flex:none;align-self:center;margin-top:16px' }, iconButton('trash', '이 법인 빼기', () => { rows = rows.filter((r) => r !== row); s.corps = rows; draw(); }))),
      el('div', { class: 'row' },
        field('연장근무 시작일', text(row, 'ot_from', { placeholder: '21', inputmode: 'numeric' }), '숫자 또는 말일'),
        field('연장근무 종료일', text(row, 'ot_to', { placeholder: '20', inputmode: 'numeric' })),
        el('label', { class: 'check' }, (() => { const b = el('input', { type: 'checkbox' }); b.checked = row.ot_prev !== false; b.addEventListener('change', () => { row.ot_prev = b.checked; }); return b; })(), el('span', {}, '시작일은 전월'))),
      el('details', { class: 'auto-corp-text' },
        el('summary', {}, row.text ? '이 법인만의 공지 문구(따로 씀)' : '이 법인만의 공지 문구 — 비우면 기본 문구로 나갑니다'),
        area(row, 'text', 10)))));
  };
  draw();
  return el('div', { class: 'set-pane' },
    el('p', { class: 'lead-muted' }, '법인마다 공지를 올릴 채널과 연장근무수당 기간을 적습니다.'),
    list,
    el('div', { class: 'set-add' }, el('button', { type: 'button', class: 'btn ghost', onclick: () => { rows.push({ key: '', label: '', channel: '', ot_from: 21, ot_to: 20, ot_prev: true, text: '' }); draw(); } }, icon('plus'), '법인 추가')),
    field('담당자', text(s, 'manager', { placeholder: '@이름' }), '문구의 {{담당자}} 자리에 들어갑니다.'),
    field('기본 공지 문구', area(s, 'text', 16), '법인 칸에 따로 적은 문구가 없으면 이 문구로 나갑니다. 슬랙 굵게는 *글자* 입니다.'),
    keys([
      ['{{법인}}', '본사'], ['{{귀속월}}', '2026년 9월'], ['{{짧은귀속월}}', '26년 9월'], ['{{귀속달}}', '9월'],
      ['{{귀속기간}}', '2026-09-01 ~ 2026-09-30'], ['{{짧은귀속기간}}', '9/1 - 9/30'], ['{{연장근무기간}}', '2026-08-21 ~ 2026-09-20'],
      ['{{지급일}}', '9월 30일(수)'], ['{{담당자}}', '@이름'], ['{{인사팀}}', '인사팀'], ['{{회사}}', '우리회사'],
    ]));
}

function longServicePane(s) {
  let rows = (s.grants ?? []).map((g) => ({ ...g }));
  s.grants = rows;
  const list = el('div', { class: 'cat-list' });
  const draw = () => {
    list.replaceChildren(...rows.map((row) => el('div', { class: 'cat-row' },
      text(row, 'years', { 'aria-label': '근속 해', class: 'tiny', placeholder: '3', inputmode: 'numeric' }),
      text(row, 'amount', { 'aria-label': '휴가지원금', placeholder: '500000', inputmode: 'numeric' }),
      text(row, 'leave', { 'aria-label': '재충전휴가 날수', class: 'tiny', placeholder: '5', inputmode: 'numeric' }),
      iconButton('trash', '이 줄 빼기', () => { rows = rows.filter((r) => r !== row); s.grants = rows; draw(); }))));
  };
  draw();
  return el('div', { class: 'set-pane' },
    el('p', { class: 'lead-muted' }, '근속 해 · 휴가지원금(원) · 재충전휴가(일) 순서입니다. 규정이 바뀌면 이 표를 고치면 됩니다. 대상자는 [직원명부]의 입사일로 찾습니다.'),
    list,
    el('div', { class: 'set-add' }, el('button', { type: 'button', class: 'btn ghost', onclick: () => { rows.push({ years: '', amount: '', leave: '' }); draw(); } }, icon('plus'), '근속 해 추가')),
    field('메일 제목', text(s, 'subject')),
    field('메일 본문', area(s, 'body', 14)),
    keys([['{{이름}}', '홍길동'], ['{{년수}}', '3'], ['{{입사일}}', '2023-09-01'], ['{{기념일}}', '2026년 9월 1일'], ['{{지원금}}', '500,000'], ['{{재충전휴가}}', '5'], ['{{기준월}}', '2026년 9월'], ['{{회사}}', '우리회사'], ['{{인사팀}}', '인사팀']]));
}

function hirePane(s) {
  return el('div', { class: 'set-pane' },
    el('p', { class: 'lead-muted' }, '입사자 등록 폼의 고르기 목록과, 할 일에서 만드는 일정·공지·메일 문구입니다.'),
    el('div', { class: 'row' },
      el('div', {}, el('span', { class: 'f-label' }, '부서 목록'), lines(s, 'depts', 5)),
      el('div', {}, el('span', { class: 'f-label' }, '직군 목록'), lines(s, 'jobs', 5))),
    el('div', { class: 'row' },
      el('div', {}, el('span', { class: 'f-label' }, '고용형태'), lines(s, 'employ_types', 2)),
      el('div', {}, el('span', { class: 'f-label' }, '지원경로'), lines(s, 'routes', 3))),
    field('인사팀 공지 채널', text(s, 'hr_channel', { placeholder: '#인사팀' })),
    field('입사 일정 제목', text(s, 'calendar_title'), "캘린더 '입·퇴사' 분야에 만드는 일정의 제목입니다."),
    field('부서 공지', area(s, 'slack_notice', 8), '{{멘션}} 자리에 부를 사람이 들어갑니다.'),
    field('인사팀 공지', area(s, 'slack_hr_notice', 8)),
    field('안내 메일 제목', text(s, 'mail_subject')),
    field('안내 메일 본문', area(s, 'mail_text', 18), '글로 씁니다. 메일 앱이 열릴 때 이 글이 본문에 들어갑니다.'),
    keys([['{{이름}}', '홍길동'], ['{{입사일}}', '2026-11-23'], ['{{부서}} {{팀}} {{파트}}', '소속'], ['{{직군}} {{직무}}', '기획 / 시스템 기획자'], ['{{고용형태}}', '정규'], ['{{영문이름}}', 'gildong.hong'], ['{{멘션}}', '@팀장'], ['{{회사}} {{주소}} {{인사팀}} {{담당자연락처}}', '회사 설정 값']]));
}

function certPane(s) {
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg' });
  const status = el('span', { class: 'lead-muted' }, s.seal ? '올라가 있음' : '없음 — (인) 글자만 찍힙니다');
  const preview = el('img', { class: 'seal-preview', alt: '인감 미리보기', hidden: !s.seal });
  if (s.seal) preview.src = s.seal;
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (!f) return;
    if (f.size > 300000) { toast('인감 그림은 300KB 이하로 올려 주세요.', { error: true }); return; }
    const fr = new FileReader();
    fr.onload = () => { s.seal = String(fr.result); preview.src = s.seal; preview.hidden = false; status.textContent = '올라감(저장을 눌러야 남습니다)'; };
    fr.readAsDataURL(f);
  });
  return el('div', { class: 'set-pane' },
    el('p', { class: 'lead-muted' }, '증명서에 찍을 담당자 이름과 인감입니다. 회사명·주소는 [회사] 탭에서 고칩니다.'),
    field('면접확인서 담당자', text(s, 'manager', { placeholder: '비우면 로그인한 사람 이름' })),
    el('div', { class: 'field' }, el('span', { class: 'f-label' }, '인감(PNG·JPEG, 배경이 투명한 PNG 권장)'), file, status, preview,
      s.seal ? el('button', { type: 'button', class: 'btn ghost sm', onclick: () => { s.seal = ''; preview.hidden = true; status.textContent = '없음 — (인) 글자만 찍힙니다'; } }, '인감 지우기') : null));
}

const PANE = { company: companyPane, payroll: payrollPane, longservice: longServicePane, hire: hirePane, cert: certPane };

// settings: 지금 설정(통째로). onSave(next) 가 저장한다. tab: 처음 보여 줄 탭.
export function openSettings({ settings, tab = 'company', onSave }) {
  const draft = JSON.parse(JSON.stringify(settings));
  const body = el('div', {});
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  let now = tab;
  const paint = () => {
    tabs.replaceChildren(...TABS.map(([key, label]) => el('button', {
      type: 'button', role: 'tab', class: 'tab' + (key === now ? ' on' : ''), 'aria-selected': String(key === now),
      onclick: () => { now = key; paint(); },
    }, label)));
    body.replaceChildren(PANE[now](draft[now]));
  };
  paint();
  const error = el('p', { class: 'form-error', hidden: true });
  const saveBtn = el('button', { type: 'button', class: 'btn primary' }, icon('check'), '저장');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    error.hidden = true;
    try {
      await onSave(draft);
      toast('설정을 저장했습니다');
      ctl.close();
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });
  const ctl = openDrawer({
    title: '자동화 설정',
    lead: chip(icon('settings')),
    wide: true,
    body: el('div', {}, tabs, error, body),
    footer: el('div', { style: 'display:flex;gap:8px;width:100%;justify-content:flex-end' },
      el('button', { type: 'button', class: 'btn ghost', onclick: () => ctl.close() }, '취소'), saveBtn),
  });
  return ctl;
}

// 화면 부품: 서랍(오른쪽 패널), 확인창, 토스트, 폼 칸.
import { el } from './dom.js';
import { icon } from './icons.js';

export const chip = (child) => el('span', { class: 'chip' }, child);

export function iconButton(name, title, onClick, disabled = false) {
  return el('button', { type: 'button', class: 'icon-btn', title, 'aria-label': title, disabled, onclick: onClick }, icon(name));
}

export function field(label, control, help = '') {
  return el('label', { class: 'field' },
    el('span', { class: 'f-label' }, label),
    control,
    help ? el('span', { class: 'f-help' }, help) : null);
}

// 서랍은 한 번에 하나만 연다. 새로 열면 먼저 것은 닫힌다.
let current = null;

export function openDrawer({ title, lead = null, body, footer = null, onClose = null, wide = false }) {
  current?.close();
  const backdrop = el('div', { class: 'backdrop' });
  const panel = el('aside', { class: 'drawer' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('header', { class: 'd-head' }, lead, el('h3', {}, title), iconButton('close', '닫기', () => close())),
    el('div', { class: 'd-body' }, body),
    footer ? el('footer', { class: 'd-foot' }, footer) : null);

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    if (current !== ctl) return;
    current = null;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    panel.remove();
    onClose?.();
  }
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop, panel);
  // 한 번 레이아웃을 읽어 시작 위치를 확정한 뒤 열어야 미끄러져 들어오는 움직임이 난다(rAF 는 숨겨진 탭에서 멈춘다).
  panel.getBoundingClientRect();
  panel.classList.add('open');

  const ctl = { close, panel };
  current = ctl;
  return ctl;
}

// 예/아니오를 묻는다. 결과는 true/false 로 돌아온다. extra 에 노드를 주면 문구 아래에 붙는다(무엇이 나가는지 목록 등).
export function confirmBox({ title, message = '', confirm = '확인', cancel = '취소', danger = false, extra = null }) {
  return new Promise((resolve) => {
    const done = (ok) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(ok); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const wrap = el('div', { class: 'confirm', onclick: (e) => { if (e.target === wrap) done(false); } },
      el('div', { class: 'confirm-box', role: 'alertdialog' },
        el('h4', {}, title),
        message ? el('p', {}, message) : null,
        extra,
        el('div', { class: 'confirm-actions' },
          el('button', { type: 'button', class: 'btn ghost', onclick: () => done(false) }, cancel),
          el('button', { type: 'button', class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => done(true) }, confirm))));
    document.addEventListener('keydown', onKey);
    document.body.append(wrap);
    wrap.querySelector('.btn.ghost').focus();
  });
}

let toastNode = null;
let toastTimer = 0;
export function toast(text, { error = false } = {}) {
  if (!toastNode) {
    toastNode = el('div', { class: 'toast', role: 'status' });
    document.body.append(toastNode);
  }
  toastNode.textContent = text;
  toastNode.classList.toggle('error', error);
  toastNode.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('show'), error ? 4000 : 2200);
}

// 글을 클립보드에 넣는다. 보안 문맥이 아니면(옛 브라우저·http) 숨은 칸을 골라 복사한다.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = el('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' }, text);
    document.body.append(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    box.remove();
    return ok;
  }
}

// <select> 를 짧게 만든다. pairs: [[value, label]], chosen: 고른 값.
export function selectBox(label, pairs, chosen, attrs = {}) {
  return el('select', { 'aria-label': label, ...attrs }, pairs.map(([value, text]) => {
    const node = el('option', { value }, text);
    node.selected = String(value) === String(chosen);
    return node;
  }));
}

// 글을 슬랙·메일처럼 보이는 말풍선에 그대로 보여 준다(줄바꿈 유지). *굵게* 는 굵게 그린다.
export function bubble(text, { slack = false } = {}) {
  const box = el('pre', { class: 'bubble' + (slack ? ' slack' : '') });
  for (const line of String(text ?? '').split('\n')) {
    const row = el('div', { class: line.startsWith('>') ? 'quote' : '' });
    const body = line.replace(/^>\s?/, '');
    if (!slack) { row.textContent = body || ' '; box.append(row); continue; }
    // 슬랙 굵게: 낱말 경계의 *…* 만. 멘션 @이름 은 색을 입힌다.
    const parts = body.split(/(\*[^*\s][^*]*?[^*\s]\*|\*[^*\s]\*|@[^\s,.!?]+)/g);
    for (const p of parts) {
      if (!p) continue;
      if (/^\*.+\*$/.test(p)) row.append(el('b', {}, p.slice(1, -1)));
      else if (p.startsWith('@')) row.append(el('span', { class: 'mention' }, p));
      else row.append(p);
    }
    if (!row.childNodes.length) row.textContent = ' ';
    box.append(row);
  }
  return box;
}

// 자동화 [예약]. 계산과 '때가 된 예약 처리' 만 둔다 — 화면은 autoview.js, 홈 카드는 homecare.js.
//
// 서버가 없는 앱이라 예약은 기록(kind 'book')으로만 남고, **브라우저가 열려 있을 때** 때가 되면 보낸다.
//   - 슬랙 Webhook 이 적혀 있으면 그 자리에서 올리고 실행 내역(run)에 적는다.
//   - Webhook 이 없거나 그때 브라우저가 닫혀 있었으면 '보내지 못함' 으로 바꾸고 홈의 [확인 필요] 에 띄운다.
// 예약 상태: waiting(기다리는 중) · done(보냈음) · failed(보내지 못함) · canceled(취소).
import { postSlack, todayYmd } from './autotext.js';

const 날꼴 = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' → 그 다음 날.
export function 다음날(today) {
  const ms = Date.parse(`${String(today ?? '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ms)) return '';
  return new Date(ms + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 예약 창의 첫 값. 급여 공지는 고른 지급일·오전 10시, 그 날이 비었거나 지났으면 내일. 나머지는 내일 09:00.
export function 예약첫값(auto, input, today = todayYmd()) {
  const 기본 = auto?.bookDefault ?? {};
  const 고른날 = 기본.dateFrom ? String(input?.[기본.dateFrom] ?? '').trim() : '';
  const 오늘 = String(today ?? '').slice(0, 10);
  const 날짜 = 날꼴.test(고른날) && 고른날 >= 오늘 ? 고른날 : 다음날(오늘);
  return { 날짜, 시각: 기본.time || '09:00' };
}

// 날짜·시각(한국 시간으로 적은 것)을 ISO 로. 브라우저 시간대가 한국이 아니어도 같은 순간을 가리키게 +09:00 을 붙인다.
export const 예약시각 = (날짜, 시각) => new Date(`${날짜}T${시각 || '09:00'}:00+09:00`).toISOString();

export const 예약상태이름 = { waiting: '기다리는 중', done: '보냈습니다', failed: '보내지 못했습니다', canceled: '취소했습니다' };

// 'MM/DD HH:MM' (브라우저 시간대).
export function 때글(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const 두 = (n) => String(n).padStart(2, '0');
  return `${두(at.getMonth() + 1)}/${두(at.getDate())} ${두(at.getHours())}:${두(at.getMinutes())}`;
}

const 기다리는 = (rows) => rows.filter((r) => r.data.state === 'waiting');

// 때가 된 예약을 처리한다. 돌려주는 것: 바뀐 예약 수. 관리자가 아니면 아무것도 하지 않는다.
let 마지막확인 = 0;
export async function 지난예약처리(ctx, { force = false } = {}) {
  if (!ctx?.canEdit) return 0;
  const now = Date.now();
  if (!force && now - 마지막확인 < 30000) return 0;
  마지막확인 = now;
  let rows;
  try { rows = await ctx.store.records('book'); } catch { return 0; }
  const 지난것 = 기다리는(rows).filter((r) => Date.parse(r.data.run_at) <= now);
  if (!지난것.length) return 0;
  let settings = null;
  try { settings = await ctx.settings(); } catch { settings = null; }
  const webhook = settings?.company?.slack_webhook || '';
  const 늦음 = (r) => now - Date.parse(r.data.run_at) > 15 * 60000; // 15분 넘게 지났으면 그때 브라우저가 닫혀 있었던 것으로 본다
  for (const r of 지난것) {
    const d = { ...r.data };
    try {
      if (!webhook) throw new Error('슬랙 Webhook 이 없어 저절로 보낼 수 없습니다. 지금 직접 실행해 주세요.');
      if (늦음(r)) throw new Error('정해진 때에 브라우저가 열려 있지 않았습니다. 지금 직접 실행해 주세요.');
      if (!d.text) throw new Error('보낼 문구가 비어 있습니다.');
      await postSlack(webhook, d.text);
      d.state = 'done';
      d.done_at = new Date().toISOString();
      d.detail = `${d.where || '슬랙'} 에 올렸습니다(예약).`;
      await ctx.store.saveRecord('run', null, { auto: d.auto, ok: true, detail: d.detail, summary: d.summary, targets: [{ name: d.where, ok: true }], text: d.text, at: d.done_at, by: '(예약)' });
    } catch (e) {
      d.state = 'failed';
      d.done_at = new Date().toISOString();
      d.detail = e.message || String(e);
    }
    try { await ctx.store.saveRecord('book', r.id, d); } catch { /* 다음에 다시 */ }
  }
  return 지난것.length;
}

// 화면이 열려 있는 동안 1분마다 살핀다. 한 번만 건다.
let 시계 = 0;
export function 예약시계(ctx, onChange) {
  if (시계 || !ctx?.canEdit) return;
  시계 = setInterval(async () => {
    const n = await 지난예약처리(ctx).catch(() => 0);
    if (n) onChange?.(n);
  }, 60000);
}

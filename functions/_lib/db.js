// 서버 쪽 공통 도우미. D1(SQLite) 읽기·쓰기와 JSON 응답.
import { DEFAULT_CATEGORIES } from '../../public/assets/model.js';

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
export const fail = (message, status = 400) => json({ error: message }, status);

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

// Cloudflare Access 가 붙여 주는 로그인 사용자. Access 없이 열면 빈 값이다.
export function whoami(request) {
  const email = request.headers.get('cf-access-authenticated-user-email') || '';
  return { email, name: email ? email.split('@')[0] : '손님' };
}

export const uid = () => 'cal_' + Date.now().toString(36) + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
export const ID = /^cal_[a-z0-9]{6,40}$/;

const COLS = ['id', 'title', 'category', 'repeat_kind', 'on_weekday', 'on_day', 'on_month',
  'start_date', 'end_date', 'holiday_rule', 'lead', 'deputy', 'note'];
const rowToItem = (r) => ({
  ...r,
  start_date: r.start_date || '', end_date: r.end_date || '',
  lead: r.lead || '', deputy: r.deputy || '', note: r.note || '',
});

export async function allItems(db) {
  const { results } = await db.prepare(`SELECT ${COLS.join(',')} FROM items ORDER BY created_at`).all();
  return results.map(rowToItem);
}

export async function oneItem(db, id) {
  const row = await db.prepare(`SELECT ${COLS.join(',')} FROM items WHERE id = ?`).bind(id).first();
  return row ? rowToItem(row) : null;
}

export function insertItem(db, id, item) {
  return db.prepare(`INSERT INTO items (${COLS.join(',')}, created_at) VALUES (${COLS.map(() => '?').join(',')}, ?)`)
    .bind(id, ...COLS.slice(1).map((c) => item[c] ?? null), new Date().toISOString());
}

export function updateItem(db, id, item) {
  const set = COLS.slice(1).map((c) => `${c} = ?`).join(', ');
  return db.prepare(`UPDATE items SET ${set} WHERE id = ?`).bind(...COLS.slice(1).map((c) => item[c] ?? null), id);
}

export async function allCategories(db) {
  const { results } = await db.prepare('SELECT key, label, color FROM categories ORDER BY pos').all();
  return results.length ? results : DEFAULT_CATEGORIES;
}

export async function categoryKeys(db) {
  return (await allCategories(db)).map((c) => c.key);
}

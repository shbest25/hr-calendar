// POST /api/done { id, due, done } — 그 회차의 완료 표시를 켜거나 끈다.
import { json, fail, readJson, ID } from '../_lib/db.js';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !ID.test(body.id || '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.due || '')) return fail('id 와 due(YYYY-MM-DD)가 필요합니다.');
  const stmt = body.done
    ? env.DB.prepare('INSERT OR IGNORE INTO done (item_id, due) VALUES (?, ?)')
    : env.DB.prepare('DELETE FROM done WHERE item_id = ? AND due = ?');
  await stmt.bind(body.id, body.due).run();
  return json({ ok: true, done: !!body.done });
}

// GET /api/categories — 분야 목록.  PUT /api/categories — 목록을 통째로 바꾼다(이름·색·순서).
import { cleanCategories } from '../../public/assets/model.js';
import { json, fail, readJson, allCategories } from '../_lib/db.js';

export async function onRequestGet({ env }) {
  return json(await allCategories(env.DB));
}

export async function onRequestPut({ request, env }) {
  const body = await readJson(request);
  if (!Array.isArray(body)) return fail('분야 목록(배열)이 필요합니다.');
  const { results } = await env.DB.prepare('SELECT DISTINCT category FROM items').all();
  try {
    const rows = cleanCategories(body, results.map((r) => r.category));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM categories'),
      ...rows.map((c, pos) => env.DB.prepare('INSERT INTO categories (key, label, color, pos) VALUES (?, ?, ?, ?)').bind(c.key, c.label, c.color, pos)),
    ]);
    return json(rows);
  } catch (e) {
    return fail(e.message);
  }
}

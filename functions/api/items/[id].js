// GET / PUT / DELETE /api/items/:id — 일정 하나 읽기·고치기·지우기.
import { cleanItem } from '../../../public/assets/model.js';
import { json, fail, readJson, ID, oneItem, updateItem, categoryKeys } from '../../_lib/db.js';

export async function onRequestGet({ params, env }) {
  if (!ID.test(params.id)) return fail('잘못된 id 입니다.');
  const item = await oneItem(env.DB, params.id);
  return item ? json(item) : fail('그 일정을 찾을 수 없습니다.', 404);
}

export async function onRequestPut({ request, params, env }) {
  if (!ID.test(params.id)) return fail('잘못된 id 입니다.');
  if (!(await oneItem(env.DB, params.id))) return fail('그 일정을 찾을 수 없습니다.', 404);
  const body = await readJson(request);
  if (!body) return fail('JSON 본문이 필요합니다.');
  try {
    const item = cleanItem(body, await categoryKeys(env.DB));
    await updateItem(env.DB, params.id, item).run();
    return json({ id: params.id, ...item });
  } catch (e) {
    return fail(e.message);
  }
}

export async function onRequestDelete({ params, env }) {
  if (!ID.test(params.id)) return fail('잘못된 id 입니다.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM done WHERE item_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM items WHERE id = ?').bind(params.id),
  ]);
  return json({ ok: true });
}

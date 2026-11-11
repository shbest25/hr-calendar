// POST /api/items — 일정(규칙) 하나 만들기.
import { cleanItem } from '../../public/assets/model.js';
import { json, fail, readJson, uid, insertItem, categoryKeys } from '../_lib/db.js';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail('JSON 본문이 필요합니다.');
  try {
    const item = cleanItem(body, await categoryKeys(env.DB));
    const id = uid();
    await insertItem(env.DB, id, item).run();
    return json({ id, ...item }, 201);
  } catch (e) {
    return fail(e.message);
  }
}

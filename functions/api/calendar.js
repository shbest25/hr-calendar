// GET /api/calendar?month=2026-11 — 그 달의 회차·공휴일·분야를 한 번에 준다.
import { expandMonth, holidaysOf } from '../../public/assets/repeat.js';
import { HOLIDAYS, COVERED_YEARS } from '../../public/assets/holidays.js';
import { json, fail, allItems, allCategories } from '../_lib/db.js';

export async function onRequestGet({ request, env }) {
  const month = new URL(request.url).searchParams.get('month') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('month 는 YYYY-MM 꼴이어야 합니다.');

  const [items, categories, done] = await Promise.all([
    allItems(env.DB),
    allCategories(env.DB),
    env.DB.prepare('SELECT item_id, due FROM done WHERE due LIKE ?').bind(month + '-%').all(),
  ]);
  const doneSet = new Set(done.results.map((r) => r.item_id + '|' + r.due));
  const occurrences = expandMonth(items, month, HOLIDAYS)
    .map((o) => ({ ...o, done: doneSet.has(o.id + '|' + o.due), can_edit: true }));

  return json({
    month,
    items: occurrences,
    holidays: holidaysOf(HOLIDAYS, month),
    categories,
    can_edit_categories: true,
    covered: COVERED_YEARS.has(month.slice(0, 4)),
  });
}

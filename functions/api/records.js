// 자동화 기록. GET /api/records?kind=hire  ·  PUT /api/records { kind, id, data }  ·  DELETE /api/records?id=
// 신규 입사자·직원명부·증명서 발급대장·실행 내역·설정이 모두 이 한 표에 JSON 으로 들어간다.
import { cleanRecord, RECORD_KINDS } from '../../public/assets/model.js';
import { json, fail, readJson } from '../_lib/db.js';

const ID = /^rec_[a-z0-9]{4,40}$/;
const row = (r) => ({ ...r, data: JSON.parse(r.data || '{}') });

export async function onRequestGet({ request, env }) {
  const kind = new URL(request.url).searchParams.get('kind') || '';
  if (!RECORD_KINDS.includes(kind)) return fail('기록 종류(kind)가 필요합니다.');
  const { results } = await env.DB.prepare('SELECT id, kind, data, created_at, updated_at FROM records WHERE kind = ? ORDER BY created_at')
    .bind(kind).all();
  return json(results.map(row));
}

export async function onRequestPut({ request, env }) {
  const body = await readJson(request);
  if (!body || !ID.test(String(body.id || ''))) return fail('기록 번호(id)가 올바르지 않습니다.');
  let data;
  try { data = cleanRecord(body.kind, body.data); } catch (e) { return fail(e.message); }
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO records (id, kind, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at`)
    .bind(body.id, body.kind, JSON.stringify(data), now, now).run();
  const saved = await env.DB.prepare('SELECT id, kind, data, created_at, updated_at FROM records WHERE id = ?').bind(body.id).first();
  return json(row(saved));
}

export async function onRequestDelete({ request, env }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!ID.test(id)) return fail('기록 번호(id)가 올바르지 않습니다.');
  await env.DB.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

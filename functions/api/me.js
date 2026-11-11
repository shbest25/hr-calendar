// GET /api/me — 지금 로그인한 사람. 브라우저는 이 응답이 오면 '서버 저장 모드'로 동작한다.
import { json, whoami } from '../_lib/db.js';

export function onRequestGet({ request }) {
  return json(whoami(request));
}

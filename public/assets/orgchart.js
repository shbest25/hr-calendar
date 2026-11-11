// 조직도·TO표가 같이 쓰는 계산. DOM 을 모르는 순수 함수만 둔다.
//
// 자료 모양(records 의 'org' 기록 하나, id = ORG_ID):
//   { rows: [{ id, parent_id, kind: 'unit'|'person', name, role, job, title, dual, tag, position, note }] }
//   · unit 의 role 은 칸 안에 적힌 리더다('팀장 / 홍길동', '리더 겸 / 강현우', '홍길동'). 사람 칸으로 올리지 않는다.
//   · person 은 job(직군)·title(직책)·dual(겸직) 을 가진다.
//   · tag === 'legend' 는 참고사항(경영진·휴직·퇴직예정자) — 인원수에 안 들어가고 나무 밖에 그린다.
//   · 맨 위 조직(parent_id 가 빈 것)은 탭 하나씩이고, '전사 통합' 탭은 그것들을 모은 가짜 뿌리다.
//
// 짜임새는 참고한 시트 방식 그대로다: 부모 상자가 밑에 딸린 칸 전체의 폭을 덮고, 사람은 소속 조직
// 바로 아래 칸에서 세로로 쌓인다. 그래서 그림이 세로로 퍼지지 않는다.

export const ORG_ID = 'rec_orgchart';
export const TO_ID = 'rec_toseats';
export const EVAL_ID = 'rec_evals';
export const ALL_CARD = '__all__';

export const 직군들 = ['프로그램', '아트', '기획', 'QA', 'PM', '스탭', '마케팅', '경영/사업', '플랫폼', '운영/관리', '사운드', '별정'];
export const 직책들 = ['파트원', '파트장', '리더', '팀장', '실장', '본부장', '디렉터', 'PD', 'CEO', 'CTO', 'CFO', 'CBO'];
// 조직 칸 안에 적는 리더의 직책. 파트장·파트원은 제 상자가 있으므로 뺀다.
export const 칸직책들 = 직책들.filter((v) => v !== '파트원' && v !== '파트장');

// ---------- 나무 ----------
const byPos = (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || String(a.id).localeCompare(String(b.id));

// 줄 목록 → 나무. 부모가 없는 줄이 뿌리다(참고사항도 뿌리에 선다 — 화면이 tag 로 가른다).
export function treeOf(rows) {
  const nodes = new Map((rows ?? []).map((r) => [String(r.id), { ...r, children: [] }]));
  const roots = [];
  for (const n of nodes.values()) {
    const p = nodes.get(String(n.parent_id ?? ''));
    if (p && p !== n) p.children.push(n); else roots.push(n);
  }
  for (const n of nodes.values()) n.children.sort(byPos);
  roots.sort(byPos);
  return roots;
}

export function flatten(tree, out = []) {
  for (const n of tree ?? []) { out.push(n); flatten(n.children, out); }
  return out;
}

export const isLegend = (n) => n?.tag === 'legend';
export const topUnits = (tree) => (tree ?? []).filter((r) => r.kind === 'unit' && !isLegend(r));
export const legendUnits = (tree) => (tree ?? []).filter((r) => r.kind === 'unit' && isLegend(r));

// 전사 통합 탭의 가짜 뿌리. id 가 없어 고칠 수도 옮길 수도 없다.
export function allRootOf(tree, name = '전사') {
  return { id: '', kind: 'unit', name, role: '', tag: 'virtual', children: topUnits(tree) };
}

// 맨 위부터 이은 이름. byId: Map(id → node)
export function pathOf(id, byId) {
  const names = [];
  for (let n = byId.get(String(id)); n && names.length < 20; n = byId.get(String(n.parent_id ?? ''))) names.unshift(n.name);
  return names.join(' › ');
}

// ---------- 자리 계산 ----------
// 돌려주는 자리: col(0 기준 칸)·span(덮는 칸 수)·row(0 기준 줄). 조직의 row 는 나무의 깊이다.
//   closed: 접은 조직 id 들, split: 뿌리 바로 밑 조직 사이에 빈 칸 하나(전사 통합에서 스튜디오를 가른다)
export function layout(root, { closed = new Set(), split = false } = {}) {
  const nodes = [];
  let at = 0;
  let maxRow = -1;
  const visit = (node, row) => {
    maxRow = Math.max(maxRow, row);
    const kids = (node.children ?? []).filter((k) => !isLegend(k));
    const 접힘 = closed.has(node.id) && kids.length > 0;
    const units = 접힘 ? [] : kids.filter((k) => k.kind === 'unit');
    const people = 접힘 ? [] : kids.filter((k) => k.kind === 'person');
    const start = at;
    let myCol = -1;
    if (people.length) { myCol = at; at += 1; }
    const 띄움 = split && row === 0;
    units.forEach((k, i) => { if (띄움 && i > 0) at += 1; visit(k, row + 1); });
    if (at === start) at = start + 1;
    const span = at - start;
    people.forEach((p, i) => {
      const r = row + 1 + i;
      maxRow = Math.max(maxRow, r);
      nodes.push({ node: p, kind: 'person', col: myCol, span: 1, row: r });
    });
    nodes.push({ node, kind: 'unit', col: start, span, row, closed: 접힘, hidden: 접힘 ? kids.length : 0 });
  };
  if (root) visit(root, 0);
  nodes.sort((a, b) => a.row - b.row || a.col - b.col);
  return { cols: at, rows: maxRow + 1, nodes };
}

// 격자 번호는 1부터. 줄은 한 칸마다 둘을 쓴다(홀수 줄은 틈, 짝수 줄은 상자).
export const gridCol = (p) => `${p.col + 1} / span ${p.span}`;
export const gridRow = (p) => `${p.row * 2 + 2}`;

// ---------- 사람 세기 ----------
const DUAL_ROLE = /(^|[\s(/])겸([\s)/]|$)/;
export function isDual(node) {
  if (node?.dual) return true;
  return DUAL_ROLE.test(String(node?.role ?? ''));
}

const LEAD_WORD = /^(리더|실장|팀장|파트장|본부장|센터장|디렉터|PD)\s*(겸)?\s*\//;

// 조직 칸 안에 적힌 리더(인원수용). 겸직 리더는 다른 곳에 이미 세였으므로 ''.
export function leaderOf(node) {
  if (node?.kind !== 'unit') return '';
  const role = String(node.role ?? '').trim();
  if (!role || isDual(node)) return '';
  if (LEAD_WORD.test(role)) return role.split('/').pop().trim();
  if (role.includes('/')) return '';
  return role;
}

// 리더를 나눠서: { 이름, 직책, 겸 } 또는 null. 겸직 리더도 돌려준다(자료용).
export function 리더정보(node) {
  if (node?.kind !== 'unit') return null;
  const role = String(node.role ?? '').trim();
  if (!role) return null;
  const 겸 = isDual(node);
  const m = LEAD_WORD.exec(role);
  if (m) return { 이름: role.split('/').pop().trim(), 직책: m[1], 겸 };
  if (role.includes('/')) return null;
  if (겸) return { 이름: role.replace(DUAL_ROLE, '').trim(), 직책: '', 겸: true };
  return { 이름: role, 직책: '', 겸: false };
}

// 리더정보 의 반대. 성함이 비면 리더가 없다.
export function 리더글(이름, 직책, 겸) {
  const 름 = String(이름 ?? '').trim();
  if (!름) return '';
  const 책 = String(직책 ?? '').trim();
  if (책) return `${책}${겸 ? ' 겸' : ''} / ${름}`;
  return 겸 ? `${름} 겸` : 름;
}

// 인원수. 겸직은 안 세고, 조직 칸 안에 적힌 리더는 세고, 참고사항은 안 센다.
export function countPeople(node) {
  if (isLegend(node)) return 0;
  let n = 0;
  if (node?.kind === 'person') n = isDual(node) ? 0 : 1;
  else if (leaderOf(node)) n = 1;
  for (const kid of node?.children ?? []) n += countPeople(kid);
  return n;
}

// 사람 상자의 이름 밑 글: 직책이 파트장 이상이면 직책, 아니면 직군. 조직 칸은 role 그대로.
const 파트원급 = new Set(['', '파트원']);
export function 상자글(node) {
  if (node?.kind !== 'person') return String(node?.role ?? '').trim();
  const 직책 = String(node?.title ?? '').trim();
  const 직군 = String(node?.job ?? '').trim();
  if (!파트원급.has(직책)) return 직책;
  if (직군) return 직군;
  return String(node?.role ?? '').trim();
}

// ---------- 찾기 ----------
// 한글 입력기가 조합 중인 낱자(ㅈ, ㅎ)는 떼고 찾는다 — 토막으로 거르면 그림이 통째로 빈다.
const 낱자 = /[ㄱ-ㆎ]+$/;
export const 찾을말 = (q) => String(q ?? '').replace(낱자, '').trim().toLowerCase();

const 찾을글 = (node) => [node.name, node.role, 상자글(node), node.kind === 'person' ? node.job : '', ...(node.덧찾을글 ?? [])]
  .map((s) => String(s ?? '')).join(' ').toLowerCase();

// 맞은 상자의 id 만(그 위 조직은 넣지 않는다). null 이면 찾는 중이 아니다.
export function 찾은것(tree, q) {
  const want = 찾을말(q);
  if (!want) return null;
  const hit = new Set();
  const walk = (node) => {
    if (찾을글(node).includes(want)) hit.add(node.id);
    for (const kid of node.children ?? []) walk(kid);
  };
  for (const root of tree ?? []) walk(root);
  return hit;
}

// ---------- TO ----------
// 숫자는 다섯 가지뿐이다. 최종 TO = 현 TO + 잔여 TO + 입사 예정 TO, 잔여 TO = 채용 중 + 결원 + 신규.
export const 빈셈 = { 현: 0, 신규: 0, 결원: 0, 채용중: 0, 입사예정: 0, 잔여: 0, 최종: 0 };
export const 숫자들 = [
  ['최종 TO', '최종', '현 TO + 잔여 TO + 입사 예정 TO. 그 조직의 최종 인원'],
  ['현 TO', '현', '지금 재직 중인 사람 수'],
  ['채용 중 TO', '채용중', '공고를 올려 전형을 진행 중인 자리'],
  ['입사 예정 TO', '입사예정', '들어올 사람이 정해진 자리'],
  ['잔여 TO', '잔여', '채용 중 + 결원 + 신규. 아직 사람이 정해지지 않은 자리'],
];

const 자리종류 = (s) => (s.step === 'incoming' ? '입사예정' : s.step === 'hiring' ? '채용중' : s.reason === 'left' ? '결원' : '신규');

// 조직마다 셈 한 벌(제 것 + 하위 합계). Map(unit_id → 셈)
export function 세기(tree, seats) {
  const out = new Map();
  const 자리 = new Map();
  for (const s of seats ?? []) {
    const k = String(s.unit_id);
    if (!자리.has(k)) 자리.set(k, []);
    자리.get(k).push(s);
  }
  const visit = (node) => {
    if (node.kind !== 'unit' || isLegend(node)) return { ...빈셈 };
    const c = { ...빈셈 };
    c.현 = isDual(node) ? 0 : (leaderOf(node) ? 1 : 0);
    for (const kid of node.children ?? []) {
      if (kid.kind === 'person') { if (!isDual(kid) && !isLegend(kid)) c.현 += 1; continue; }
      const k = visit(kid);
      for (const key of Object.keys(빈셈)) c[key] += k[key];
    }
    for (const s of 자리.get(String(node.id)) ?? []) c[자리종류(s)] += 1;
    c.잔여 = c.채용중 + c.결원 + c.신규;
    c.최종 = c.현 + c.잔여 + c.입사예정;
    if (node.id) out.set(String(node.id), c);
    return c;
  };
  for (const r of tree ?? []) visit(r);
  return out;
}

// 요약 표의 줄. 조직 칸만 한 줄씩, 참고사항은 뺀다. 가짜 뿌리(id 없음)는 줄로 안 선다.
export function 요약(root, 셈 = new Map(), { 깊이 = 99 } = {}) {
  const rows = [];
  const walk = (node, depth) => {
    if (!node || node.kind !== 'unit' || isLegend(node)) return;
    const 진짜 = Boolean(node.id);
    if (진짜) {
      if (depth > 깊이) return;
      rows.push({ id: node.id, name: node.name, depth, c: 셈.get(String(node.id)) ?? 빈셈 });
    }
    for (const kid of node.children ?? []) walk(kid, 진짜 ? depth + 1 : depth);
  };
  walk(root, 0);
  return rows;
}

// 맨 윗줄(depth 0)만 더한다 — 위층 셈은 이미 하위 합계를 품고 있다.
export function 합계(rows = []) {
  const 위 = rows.filter((r) => r.depth === 0);
  const out = { ...빈셈 };
  for (const key of Object.keys(빈셈)) out[key] = 위.reduce((a, r) => a + Number(r.c?.[key] ?? 0), 0);
  return out;
}

// 빈자리 상자에 적히는 글과 색.
export const 결원꼬리 = (s) => (s.reason === 'left' && s.left_name ? `${s.left_name} 결원` : '');
export function 자리글(s) {
  if (s.step === 'incoming') return { name: '입사 예정 TO', role: [s.join_name, s.join_at].filter(Boolean).join(' / ') };
  if (s.step === 'hiring') return { name: '채용 중 TO', role: [s.job, 결원꼬리(s)].filter(Boolean).join(' · ') };
  if (s.reason === 'left') return { name: '결원 TO', role: 결원꼬리(s) };
  return { name: '신규 TO', role: s.job || '' };
}
export const 자리색 = (s) => (s.step === 'incoming' ? 'to-s-incoming' : s.step === 'hiring' ? 'to-s-hiring' : s.reason === 'left' ? 'to-s-left' : 'to-s-new');
export const 진행이름 = { idle: '대기', hiring: '채용 중', incoming: '입사 예정' };
export const 사유이름 = { new: '신규', left: '결원' };

// 빈자리를 가짜 사람으로 끼운 나무 — 조직도와 같은 자리 계산을 쓰기 위해서다. 재직자 뒤에 붙인다.
export function 자리끼운나무(node, seatsOf) {
  const kids = (node.children ?? []).map((k) => 자리끼운나무(k, seatsOf));
  const 자리 = node.id && node.kind === 'unit' ? seatsOf(node.id).map((s) => {
    const { name, role } = 자리글(s);
    return { id: `seat:${s.id}`, kind: 'person', name, role, seat: s, 덧찾을글: [s.job, s.left_name, s.join_name], children: [] };
  }) : [];
  return { ...node, children: [...kids, ...자리] };
}

// TO 기록 한 줄을 읽는 문장으로.
const 상태말 = (s) => (!s ? '' : s.step === 'incoming' ? '입사 예정 TO' : s.step === 'hiring' ? '채용 중 TO' : s.reason === 'left' ? '결원 TO' : '신규 TO');
export function 기록글(r, 칸이름 = '') {
  const 의 = 칸이름 ? `${칸이름}의 ` : '';
  const 에 = 칸이름 ? `${칸이름}에 ` : '';
  const 전 = 상태말(r.before);
  const 후 = 상태말(r.after);
  switch (r.kind) {
    case 'seat-add': return `${에}${후 || 'TO'} 를 만들었습니다`;
    case 'seat-drop': return `${의}${전 || 'TO'} 를 삭제했습니다`;
    case 'hiring': return `${의}${전 || 'TO'} 를 채용 중 TO 로 바꿨습니다`;
    case 'idle': return `${의}채용을 멈췄습니다 — ${후 || '신규 TO'} 로 돌아갑니다`;
    case 'incoming': return `${의}${전 || 'TO'} 에 입사 예정자를 붙였습니다`;
    case 'detach': return `${의}입사 예정자를 뗐습니다 — ${후 || 'TO'} 로 돌아갑니다`;
    case 'move': return `${r.note ? '' : ''}${전 || 'TO'} 를 ${칸이름 || '다른 칸'} 으로 옮겼습니다`;
    case 'edit': return 전 && 후 && 전 !== 후 ? `${의}${전} 를 ${후} 로 바꿨습니다` : `${의}${전 || 후 || 'TO'} 를 고쳤습니다`;
    default: return [칸이름, r.kind].filter(Boolean).join(' · ');
  }
}

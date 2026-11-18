// 엑셀(.xlsx) 읽기 — 복지카드의 발급현황 비교가 올린 파일을 읽는다.
// 빌드 단계가 없어 라이브러리를 들이지 않는다. zip 은 끝 레코드 → 중앙 목록으로 읽고,
// 압축은 STORE(0)·DEFLATE(8)만 푼다(브라우저의 DecompressionStream). XML 은 정규식으로 읽는다.

const 못읽음 = () => new Error('엑셀 파일을 읽지 못했습니다');
const dec = new TextDecoder('utf-8');

export const 글로 = (bytes) => dec.decode(bytes);

async function 펴기(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 이름 → 내용(바이트) 지도. 로컬 머리의 크기 칸은 0 일 수 있어 중앙 목록의 값을 쓴다.
export async function 압축풀기(bytes) {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw 못읽음();
    const 수 = dv.getUint16(end + 10, true);
    let p = dv.getUint32(end + 16, true);
    const out = new Map();
    for (let k = 0; k < 수; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw 못읽음();
      const 방식 = dv.getUint16(p + 10, true);
      const 압축크기 = dv.getUint32(p + 20, true);
      const 이름길이 = dv.getUint16(p + 28, true);
      const 덤길이 = dv.getUint16(p + 30, true);
      const 주석길이 = dv.getUint16(p + 32, true);
      const 머리자리 = dv.getUint32(p + 42, true);
      const 이름 = dec.decode(bytes.subarray(p + 46, p + 46 + 이름길이));
      p += 46 + 이름길이 + 덤길이 + 주석길이;
      if (이름.endsWith('/')) continue;
      if (방식 !== 0 && 방식 !== 8) throw 못읽음();
      if (dv.getUint32(머리자리, true) !== 0x04034b50) throw 못읽음();
      const 시작 = 머리자리 + 30 + dv.getUint16(머리자리 + 26, true) + dv.getUint16(머리자리 + 28, true);
      const 조각 = bytes.subarray(시작, 시작 + 압축크기);
      out.set(이름, 방식 === 0 ? new Uint8Array(조각) : await 펴기(조각));
    }
    return out;
  } catch {
    throw 못읽음();
  }
}

const 개체 = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const 풀기 = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, g) => {
  if (g[0] !== '#') return 개체[g];
  const n = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
  return Number.isFinite(n) ? String.fromCodePoint(n) : m;
});

function 글(files, path) {
  const b = files.get(path);
  if (!b) throw 못읽음();
  return 글로(b);
}

// 속성 값 하나('r="A1"' 에서 A1).
const 속성 = (태그, 이름) => {
  const m = new RegExp(`(?:^|\\s)${이름}="([^"]*)"`).exec(태그);
  return m ? 풀기(m[1]) : null;
};

// <t>…</t> 조각들을 이어 붙인다(서식 있는 글 <r> 도 같다). <rPh> 후리가나는 뺀다.
function 글조각(xml) {
  const 깨끗 = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let s = '';
  for (const m of 깨끗.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) s += 풀기(m[1] ?? '');
  return s;
}

function 공유글들(files) {
  if (!files.has('xl/sharedStrings.xml')) return [];
  const xml = 글(files, 'xl/sharedStrings.xml');
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => 글조각(m[1] ?? ''));
}

export function 시트목록(files) {
  const wb = 글(files, 'xl/workbook.xml');
  const rels = 글(files, 'xl/_rels/workbook.xml.rels');
  const 대상 = new Map();
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = 속성(m[1], 'Id');
    const to = 속성(m[1], 'Target');
    if (id && to) 대상.set(id, to);
  }
  const out = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = 속성(m[1], 'name');
    const rid = 속성(m[1], 'r:id');
    let to = 대상.get(rid);
    if (name === null || !to) continue;
    to = to.startsWith('/') ? to.slice(1) : `xl/${to.replace(/^\.\//, '')}`;
    out.push({ name, path: to, index: out.length });
  }
  return out;
}

const 열번호 = (ref) => {
  let n = 0;
  for (const ch of /^[A-Z]+/i.exec(ref)?.[0] ?? '') n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n;
};

// 행 → (열 → {v, t, s}). 열은 1부터. 값이 없는 칸(서식만 있는 칸)도 v:null 로 담는다.
export function 시트칸들(files, path) {
  const 공유 = 공유글들(files);
  const xml = 글(files, path);
  const 행들 = new Map();
  let 다음행 = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const 행 = Number(속성(rm[1], 'r')) || 다음행 + 1;
    다음행 = 행;
    const 칸들 = 행들.get(행) ?? new Map();
    행들.set(행, 칸들);
    let 다음열 = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = 속성(cm[1], 'r');
      const 열 = ref ? 열번호(ref) : 다음열 + 1;
      다음열 = 열;
      const 종류 = 속성(cm[1], 't');
      const s = Number(속성(cm[1], 's')) || 0;
      const 안 = cm[2] ?? '';
      const vm = /<v\b[^>]*?>([\s\S]*?)<\/v>/.exec(안);
      let v = null;
      let t = null;
      if (종류 === 'inlineStr') {
        v = 글조각(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(안)?.[1] ?? ''); t = 's';
      } else if (vm) {
        const raw = 풀기(vm[1]);
        if (종류 === 's') { v = 공유[Number(raw)] ?? ''; t = 's'; }
        else if (종류 === 'str') { v = raw; t = 's'; }
        else if (종류 === 'b') { v = raw; t = 'b'; }
        else if (종류 === 'e') { v = raw; t = 'e'; }
        else { v = Number(raw); t = 'n'; if (!Number.isFinite(v)) { v = raw; t = 's'; } }
      }
      칸들.set(열, { v, t, s });
    }
  }
  return 행들;
}

// 0부터, A열부터 빽빽한 2차원. 빈 칸은 null.
export function 값줄들(files, path) {
  const 칸 = 시트칸들(files, path);
  const 맨끝행 = Math.max(0, ...칸.keys());
  const 줄들 = [];
  for (let r = 1; r <= 맨끝행; r++) {
    const 행 = 칸.get(r);
    const 끝열 = 행 ? Math.max(0, ...행.keys()) : 0;
    const 줄 = [];
    for (let c = 1; c <= 끝열; c++) 줄.push(행.get(c)?.v ?? null);
    줄들.push(줄);
  }
  return 줄들;
}

// 올린 파일(File) → 첫 시트(또는 이름이 맞는 시트)의 값줄. 시트 이름을 주면 그 시트를 먼저 찾는다.
export async function 파일값줄(file, sheetName = '') {
  const files = await 압축풀기(new Uint8Array(await file.arrayBuffer()));
  const 시트들 = 시트목록(files);
  if (!시트들.length) throw 못읽음();
  const 시트 = (sheetName && 시트들.find((s) => s.name.trim() === sheetName)) || 시트들[0];
  return { sheet: 시트.name, rows: 값줄들(files, 시트.path) };
}

// 아주 작은 엑셀(.xlsx) 만들기 — 글자(와 숫자)만 든 시트 몇 장. 모두싸인 계약서 엑셀과 복지카드 파일이 쓴다.
// 빌드 단계가 없는 앱이라 라이브러리를 들이지 않고, 압축 없이(STORE) zip 으로 묶는다.
// 글자는 inlineStr 로 칸에 바로 넣는다(공유 문자열 표를 만들지 않는다). 머리 줄의 빈 칸은 적지 않는다.

export function 열이름(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export const 글자 = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // XML 1.0 에 못 쓰는 제어 글자는 뺀다(줄바꿈·탭은 둔다).
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// headRows: 머리 줄 수. 그 아래 줄은 빈 칸도 적는다(칸을 순서로 읽는 쪽이 있어도 열이 밀리지 않게).
// 숫자: 참이면 숫자 값을 숫자 칸으로 적는다(엑셀만들기 는 늘 글자로 적는다).
function 시트(rows, merges, headRows, 숫자 = false) {
  const 줄들 = rows.map((row, ri) => {
    const 칸들 = (row ?? []).map((v, ci) => {
      if ((v === null || v === undefined || v === '') && ri < headRows) return '';
      if (v === null || v === undefined) v = '';
      if (숫자 && typeof v === 'number' && Number.isFinite(v)) return `<c r="${열이름(ci + 1)}${ri + 1}"><v>${v}</v></c>`;
      // 줄바꿈이 든 칸은 줄을 바꿔 보이게 1번 서식(wrap)을 쓴다.
      const 서식 = String(v).includes('\n') ? ' s="1"' : '';
      return `<c r="${열이름(ci + 1)}${ri + 1}" t="inlineStr"${서식}><is><t xml:space="preserve">${글자(v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${칸들}</row>`;
  }).join('');
  const 병합 = merges?.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  return `${XML}<worksheet xmlns="${NS}" xmlns:r="${RNS}"><cols><col min="1" max="${Math.max(1, ...rows.map((r) => r?.length ?? 0))}" width="22" customWidth="1"/></cols>`
    + `<sheetData>${줄들}</sheetData>${병합}</worksheet>`;
}

// 시트들: [{ name, xml }].
const 부품 = (시트들) => ({
  '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + 시트들.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>',
  '_rels/.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>',
  'xl/workbook.xml': `${XML}<workbook xmlns="${NS}" xmlns:r="${RNS}"><sheets>${
    시트들.map((t, i) => `<sheet name="${글자(t.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + 시트들.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${시트들.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>',
  'xl/styles.xml': `${XML}<styleSheet xmlns="${NS}">`
    + '<fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>',
  ...Object.fromEntries(시트들.map((t, i) => [`xl/worksheets/sheet${i + 1}.xml`, t.xml])),
});

let 표 = null;
function crc32(bytes) {
  if (!표) {
    표 = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      표[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = 표[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// 이름 → 내용(글자 또는 바이트) 묶음을 압축 없는 zip 바이트로.
export function zip묶기(files) {
  const enc = new TextEncoder();
  const 앞 = [];
  const 목록 = [];
  let off = 0;
  // 날짜·시각은 1980-01-01 00:00 으로 고정한다(같은 내용이면 같은 파일이 나온다).
  const 시각 = 0;
  const 날 = (0 << 9) | (1 << 5) | 1;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name);
    const d = typeof text === 'string' ? enc.encode(text) : text;
    const c = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 시각, true); h.setUint16(12, 날, true); h.setUint32(14, c, true);
    h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
    앞.push(new Uint8Array(h.buffer), n, d);
    const e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true);
    e.setUint16(10, 0, true); e.setUint16(12, 시각, true); e.setUint16(14, 날, true); e.setUint32(16, c, true);
    e.setUint32(20, d.length, true); e.setUint32(24, d.length, true); e.setUint16(28, n.length, true);
    e.setUint32(42, off, true);
    목록.push(new Uint8Array(e.buffer), n);
    off += 30 + n.length + d.length;
  }
  const 목록크기 = 목록.reduce((s, a) => s + a.length, 0);
  const 끝 = new DataView(new ArrayBuffer(22));
  const 수 = Object.keys(files).length;
  끝.setUint32(0, 0x06054b50, true); 끝.setUint16(8, 수, true); 끝.setUint16(10, 수, true);
  끝.setUint32(12, 목록크기, true); 끝.setUint32(16, off, true);
  const 조각들 = [...앞, ...목록, new Uint8Array(끝.buffer)];
  const out = new Uint8Array(조각들.reduce((s, a) => s + a.length, 0));
  let p = 0;
  for (const a of 조각들) { out.set(a, p); p += a.length; }
  return out;
}

// rows: 줄마다 칸 글자 배열(null·'' 은 빈칸). merges: ['A1:E1', …]. headRows: 빈 칸을 적지 않을 머리 줄 수.
export function 엑셀만들기({ rows, merges = [], headRows = 2 }) {
  return zip묶기(부품([{ name: 'Sheet1', xml: 시트(rows ?? [], merges, headRows) }]));
}

// 시트 여럿. sheets: [{ name, rows, merges, headRows }] — 숫자 값은 숫자 칸으로 적는다.
export function 엑셀여러시트({ sheets }) {
  return zip묶기(부품(sheets.map(({ name, rows, merges = [], headRows = 2 }) => ({
    name, xml: 시트(rows ?? [], merges, headRows, true),
  }))));
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// 윈도에서 파일 이름에 못 쓰는 글자만 바꾼다.
export const 파일이름 = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_');

// 바이트를 .xlsx 로 내려받는다.
export function 엑셀받기(bytes, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: XLSX }));
  a.download = 파일이름(name.endsWith('.xlsx') ? name : `${name}.xlsx`);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

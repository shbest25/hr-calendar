// 증명서를 A4 에 칠한다. 미리보기와 PDF 가 같은 칠하기를 쓴다 — 본 것이 그대로 나간다.
// 칠하기는 캔버스에 직접 하고, PDF 는 장마다 JPEG 로 담아 바깥 라이브러리 없이 만든다.
import { 날짜글, 기간글, 전형제목, 면접본문, 취업본문, 증명문구, 휴직글 } from './certtext.js';

const 짧은날 = (ymd) => (/^\d{4}-\d{2}-\d{2}$/.test(String(ymd ?? '')) ? String(ymd).replaceAll('-', '.') : '');
const 짧은기간 = (a, b) => (짧은날(a) ? `${짧은날(a)} ~ ${짧은날(b) || '현재'}` : '');

export const 쪽 = { w: 595.28, h: 841.89 };
const 글꼴 = 'CertPretendard';
const 글꼴주소 = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-';

const 띄움제목 = (t) => (t.length <= 6 ? [...t].join(' ') : t);

// 화면 값 → 칠할 것.
// doc: { kind, 회사: {name, address}, 발급일, 성명, 번호?, …종류별 값 }
export function 증명서모양(doc) {
  const kind = doc.kind;
  const 공통 = { kind, 번호: doc.번호 ?? '', 날짜: 날짜글(doc.발급일), 회사명: doc.회사?.name ?? '', 주소: doc.회사?.address ?? '' };

  if (kind === 'interview' || kind === 'jobseek') {
    const 면접 = kind === 'interview';
    return {
      ...공통,
      꼴: '지원자',
      제목: 면접 ? 전형제목(doc.전형) : '취업활동 증명서',
      칸제목: 면접 ? '면접 응시자 정보' : '입사지원자 정보',
      칸: [['성명', doc.성명 ?? ''], ['생년월일', 날짜글(doc.생년월일)], ['용도', doc.용도 ?? '']],
      본문: 면접 ? 면접본문({ 전형일: doc.전형일, 전형: doc.전형 }) : 취업본문({ 지원일: doc.지원일 }),
      회사제목: 면접 ? '면접시행 회사 정보' : '회사 정보',
      담당자: doc.담당자 ?? '',
    };
  }

  const 선택 = doc.선택 ?? {};
  const 기본 = [['성명', doc.성명 ?? ''], ['소속 부서', doc.소속 ?? '']];
  if (doc.직책) 기본.push(['직책', doc.직책]);
  if (doc.주민가림) 기본.push(['주민등록번호', doc.주민가림]);
  const 재직 = [
    ['재직기간', 기간글(doc.입사일, kind === 'employ' ? '' : doc.퇴사일)],
    ['담당업무', doc.담당업무 ?? ''],
  ];
  if (선택.휴직) 재직.push(['휴직 기간', 휴직글(선택.휴직) || '없음']);
  if (kind === 'career' && 선택.퇴사사유 != null) 재직.push(['퇴사 사유', 선택.퇴사사유 || '-']);
  if (선택.징계) {
    재직.push(['징계 내역', 선택.징계.length
      ? 선택.징계.map((x) => [날짜글(x.날짜), x.조치구분, x.사유].filter(Boolean).join('  ')).join('\n')
      : '없음']);
  }
  if (선택.용도) 재직.push(['용도', 선택.용도]);

  const 표들 = [{ 제목: '기본정보', 줄: 기본 }, { 제목: '재직정보', 줄: 재직 }];
  if (선택.발령) {
    표들.push({ 제목: '발령 이력', 머리: ['기간', '소속', '직책'], 줄: 선택.발령.map((g) => [짧은기간(g.from, g.to || (kind === 'employ' ? '' : doc.퇴사일)), g.소속, g.직책 || '-']) });
  }
  return { ...공통, 꼴: '직원', 제목: kind === 'employ' ? '재직증명서' : '경력증명서', 표들, 주석: [], 증명: 증명문구(kind) };
}

// ── 글꼴 ───────────────────────────────────────────────────────
let 글꼴약속 = null;
// 글꼴을 한 번만 불러온다. 못 불러오면(오프라인 등) 컴퓨터에 깔린 글꼴로 칠한다.
export function 글꼴준비() {
  if (!('FontFace' in window)) return Promise.resolve();
  글꼴약속 ??= Promise.all([[400, 'Regular'], [600, 'SemiBold'], [700, 'Bold']].map(async ([w, n]) => {
    const f = new FontFace(글꼴, `url(${글꼴주소}${n}.woff2)`, { weight: String(w) });
    document.fonts.add(await f.load());
  })).catch((e) => { 글꼴약속 = null; console.warn('증명서 글꼴을 불러오지 못했습니다:', e); });
  return 글꼴약속;
}

const 서체 = (크기, 굵기 = 400) => `${굵기} ${크기}px ${글꼴}, Pretendard, "Malgun Gothic", sans-serif`;

// 폭에 맞춰 줄을 나눈다. 띄어쓰기에서 먼저 끊고, 한 낱말이 너무 길면 글자 단위로 끊는다.
export function 줄나누기(재기, 글, 폭) {
  const out = [];
  for (const 단락 of String(글 ?? '').split('\n')) {
    let 줄 = '';
    for (const 낱 of 단락.split(/(\s+)/)) {
      if (!낱) continue;
      const 시도 = 줄 + 낱;
      if (재기(시도) <= 폭 || !줄.trim()) {
        줄 = 시도;
        while (재기(줄) > 폭 && 줄.length > 1) {
          let i = 줄.length - 1;
          while (i > 1 && 재기(줄.slice(0, i)) > 폭) i -= 1;
          out.push(줄.slice(0, i));
          줄 = 줄.slice(i);
        }
      } else {
        out.push(줄.trimEnd());
        줄 = 낱.trimStart();
      }
    }
    out.push(줄.trimEnd());
  }
  return out;
}

const 테두리 = '#868686';
const 라벨바탕 = '#F6F6F6';

export function 쪽수(ctx, 모양) {
  return 모양.꼴 === '지원자' ? 1 : 직원배치(ctx, 모양).쪽수;
}

// ctx 는 pt 단위로 맞춰 둔 것(배율은 부르는 쪽이 건다). 인감: 이미 불러온 그림(없으면 '(인)' 만). 몇째 장인지는 0 부터.
export function 칠하기(ctx, 모양, 인감 = null, 몇째 = 0) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 쪽.w, 쪽.h);
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'alphabetic';
  if (모양.번호) {
    ctx.font = 서체(8.5);
    ctx.fillStyle = '#777';
    ctx.textAlign = 'left';
    ctx.fillText(`발급번호  ${모양.번호}`, 48, 40);
    ctx.fillStyle = '#111';
  }
  if (모양.꼴 === '지원자') 지원자칠하기(ctx, 모양, 인감);
  else 직원칠하기(ctx, 모양, 인감, 몇째);
  ctx.restore();
}

function 제목칠하기(ctx, 제목, y) {
  ctx.font = 서체(24, 700);
  ctx.textAlign = 'center';
  ctx.fillText(띄움제목(제목), 쪽.w / 2, y);
}

const 인감지름 = 52;
// '(인)' 과 인감. 인감은 '(인)' 글자 위에 겹쳐 찍는다.
function 인칠하기(ctx, x, y, 인감) {
  ctx.font = 서체(11);
  ctx.textAlign = 'left';
  ctx.fillText('(인)', x, y);
  if (인감) {
    const 가운데x = x + ctx.measureText('(인)').width / 2;
    ctx.drawImage(인감, 가운데x - 인감지름 / 2, y - 4 - 인감지름 / 2, 인감지름, 인감지름);
  }
}

// ── 재직·경력증명서: 자리 잡기 → 칠하기 ─────────────────────────────
const 왼 = 48;
const 오 = 쪽.w - 48;
const 라벨폭 = 136;
const 첫위 = 168;
const 다음위 = 72;
const 바닥 = 쪽.h - 60;
const 아래몫 = 130;
const 줄높이 = 15;
const 안 = 12;

function 칸글(ctx, 칸들, 폭들, 굵게) {
  return 칸들.map((v, i) => {
    ctx.font = 서체(10.5, 굵게(i) ? 600 : 400);
    return 줄나누기((t) => ctx.measureText(t).width, v, 폭들[i] - 안 * 2);
  });
}

export function 직원배치(ctx, 모양) {
  const 것들 = [];
  let 장 = 0;
  let y = 첫위;
  const 넘김 = () => { 장 += 1; y = 다음위; };
  const 줄재기 = (폭들, 칸들, 꼴) => {
    const 굵게 = (i) => 꼴 === '머리' || (꼴 === '라벨' && i === 0);
    const 나눈 = 칸글(ctx, 칸들, 폭들, 굵게);
    const 높이 = Math.max(42, Math.max(...나눈.map((n) => n.length)) * 줄높이 + 20);
    return { 폭들, 나눈, 높이, 꼴 };
  };
  for (const 표 of 모양.표들) {
    const 폭들 = 표.머리 ? [150, 오 - 왼 - 150 - 70, 70] : [라벨폭, 오 - 왼 - 라벨폭];
    const 머리 = 표.머리 ? 줄재기(폭들, 표.머리, '머리') : null;
    const 줄들 = 표.줄.map((r) => 줄재기(폭들, r, 표.머리 ? '보통' : '라벨'));
    const 첫높이 = (머리?.높이 ?? 0) + (줄들[0]?.높이 ?? 0);
    if (y + 10 + 첫높이 > 바닥) 넘김();
    것들.push({ 장, 종류: '제목', y, 글: 표.제목 });
    y += 10;
    if (머리) { 것들.push({ 장, 종류: '줄', y, ...머리 }); y += 머리.높이; }
    for (const r of 줄들) {
      if (y + r.높이 > 바닥) {
        넘김();
        것들.push({ 장, 종류: '제목', y, 글: `${표.제목} (계속)` });
        y += 10;
        if (머리) { 것들.push({ 장, 종류: '줄', y, ...머리 }); y += 머리.높이; }
      }
      것들.push({ 장, 종류: '줄', y, ...r });
      y += r.높이;
    }
    y += 26;
  }
  ctx.font = 서체(9.5);
  for (const 주석 of 모양.주석 ?? []) {
    for (const 글 of 줄나누기((t) => ctx.measureText(t).width, 주석, 오 - 왼)) {
      if (y + 14 > 바닥) 넘김();
      것들.push({ 장, 종류: '주석', y, 글 });
      y += 14;
    }
  }
  if (y + 30 + 아래몫 > 바닥 + 20) 넘김();
  것들.push({ 장, 종류: '아래', y: 장 === 0 ? Math.max(y + 30, 650) : Math.max(y + 30, 다음위 + 40) });
  return { 것들, 쪽수: 장 + 1 };
}

function 직원칠하기(ctx, 모양, 인감, 몇째) {
  const { 것들, 쪽수: 수 } = 직원배치(ctx, 모양);
  if (몇째 === 0) 제목칠하기(ctx, 모양.제목, 118);
  ctx.lineWidth = 0.75;
  for (const 것 of 것들.filter((x) => x.장 === 몇째)) {
    if (것.종류 === '제목') {
      ctx.font = 서체(12, 700); ctx.fillStyle = '#111'; ctx.textAlign = 'left';
      ctx.fillText(것.글, 왼, 것.y);
    } else if (것.종류 === '줄') {
      줄칠하기(ctx, 것);
    } else if (것.종류 === '주석') {
      ctx.font = 서체(9.5); ctx.fillStyle = '#444'; ctx.textAlign = 'left';
      ctx.fillText(것.글, 왼, 것.y);
    } else if (것.종류 === '아래') {
      아래칠하기(ctx, 모양, 인감, 것.y);
    }
  }
  if (수 > 1) {
    ctx.font = 서체(9); ctx.fillStyle = '#777'; ctx.textAlign = 'center';
    ctx.fillText(`${몇째 + 1} / ${수}`, 쪽.w / 2, 쪽.h - 28);
  }
}

function 줄칠하기(ctx, { y, 폭들, 나눈, 높이, 꼴 }) {
  let cx = 왼;
  나눈.forEach((줄들, i) => {
    const 굵게 = 꼴 === '머리' || (꼴 === '라벨' && i === 0);
    if (굵게) { ctx.fillStyle = 라벨바탕; ctx.fillRect(cx, y, 폭들[i], 높이); }
    ctx.strokeStyle = 테두리;
    ctx.strokeRect(cx, y, 폭들[i], 높이);
    ctx.fillStyle = '#111';
    ctx.font = 서체(10.5, 굵게 ? 600 : 400);
    ctx.textAlign = 꼴 === '머리' ? 'center' : 'left';
    const 시작 = y + 높이 / 2 - ((줄들.length - 1) * 줄높이) / 2 + 4;
    줄들.forEach((t, k) => ctx.fillText(t, 꼴 === '머리' ? cx + 폭들[i] / 2 : cx + 안, 시작 + k * 줄높이));
    cx += 폭들[i];
  });
}

// 회사명과 '(인)' 을 한 덩어리로 쪽 가운데에 세운다.
export function 서명자리(가운데, 이름폭, 인폭) {
  const 틈 = Math.max(10, 인감지름 / 2 - 인폭 / 2);
  const 이름x = 가운데 - (이름폭 + 틈 + 인폭) / 2;
  return { 이름x, 인x: 이름x + 이름폭 + 틈 };
}

function 아래칠하기(ctx, 모양, 인감, 아래) {
  ctx.fillStyle = '#111';
  ctx.font = 서체(13, 600); ctx.textAlign = 'center';
  ctx.fillText(모양.증명, 쪽.w / 2, 아래);
  ctx.font = 서체(12);
  ctx.fillText(모양.날짜, 쪽.w / 2, 아래 + 40);
  ctx.font = 서체(11);
  const 인폭 = ctx.measureText('(인)').width;
  ctx.font = 서체(15, 700);
  const { 이름x, 인x } = 서명자리(쪽.w / 2, ctx.measureText(모양.회사명).width, 인폭);
  ctx.textAlign = 'left';
  ctx.fillText(모양.회사명, 이름x, 아래 + 92);
  인칠하기(ctx, 인x, 아래 + 92, 인감);
  if (모양.주소) {
    ctx.font = 서체(9.5); ctx.fillStyle = '#555'; ctx.textAlign = 'center';
    ctx.fillText(모양.주소, 쪽.w / 2, 아래 + 116);
  }
}

// ── 면접확인서·취업활동 증명서(한 장) ───────────────────────────────
function 표한줄(ctx, x, y, 폭들, 칸들) {
  const 나눈 = 칸글(ctx, 칸들, 폭들, (i) => i === 0);
  const 높이 = Math.max(42, Math.max(...나눈.map((n) => n.length)) * 줄높이 + 20);
  ctx.lineWidth = 0.75;
  let cx = x;
  나눈.forEach((줄들, i) => {
    if (i === 0) { ctx.fillStyle = 라벨바탕; ctx.fillRect(cx, y, 폭들[i], 높이); }
    ctx.strokeStyle = 테두리;
    ctx.strokeRect(cx, y, 폭들[i], 높이);
    ctx.fillStyle = '#111';
    ctx.font = 서체(10.5, i === 0 ? 600 : 400);
    ctx.textAlign = 'left';
    const 시작 = y + 높이 / 2 - ((줄들.length - 1) * 줄높이) / 2 + 4;
    줄들.forEach((t, k) => ctx.fillText(t, cx + 안, 시작 + k * 줄높이));
    cx += 폭들[i];
  });
  return y + 높이;
}

function 지원자칠하기(ctx, 모양, 인감) {
  const 왼쪽 = 78;
  const 오른쪽 = 쪽.w - 78;
  제목칠하기(ctx, 모양.제목, 150);
  let y = 230;
  ctx.font = 서체(12, 700); ctx.textAlign = 'left';
  ctx.fillText(`<${모양.칸제목}>`, 왼쪽, y);
  y += 12;
  for (const [라벨, 값] of 모양.칸) y = 표한줄(ctx, 왼쪽, y, [120, 오른쪽 - 왼쪽 - 120], [라벨, 값]);
  y += 54;
  ctx.font = 서체(12.5); ctx.textAlign = 'left';
  for (const 줄 of 줄나누기((t) => ctx.measureText(t).width, 모양.본문, 오른쪽 - 왼쪽)) { ctx.fillText(줄, 왼쪽, y); y += 22; }
  y += 40;
  ctx.textAlign = 'center'; ctx.font = 서체(12.5);
  ctx.fillText(모양.날짜, 쪽.w / 2, y);
  y += 90;
  ctx.textAlign = 'left'; ctx.font = 서체(12, 700);
  ctx.fillText(`<${모양.회사제목}>`, 왼쪽, y);
  y += 30;
  ctx.font = 서체(11.5);
  ctx.fillText(`회사명: ${모양.회사명}`, 왼쪽 + 8, y);
  y += 24;
  if (모양.주소) { ctx.fillText(`주   소: ${모양.주소}`, 왼쪽 + 8, y); y += 24; }
  const 담당 = `담당자: ${모양.담당자}`;
  ctx.fillText(담당, 왼쪽 + 8, y);
  인칠하기(ctx, 왼쪽 + 8 + ctx.measureText(담당).width + 40, y, 인감);
}

// ── PDF ─────────────────────────────────────────────────────────
// 장마다 그림 한 장(JPEG 그대로 /DCTDecode). 장들: [{ jpeg: Uint8Array, w, h }], 종이 크기 pw×ph(pt).
export function 여러장PDF(장들, pw, ph) {
  const 바이트 = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) b[i] = s.charCodeAt(i) & 0xff; return b; };
  const 조각 = [];
  let 자리 = 0;
  const 자리들 = [];
  const 넣기 = (x) => { const b = typeof x === 'string' ? 바이트(x) : x; 조각.push(b); 자리 += b.length; };
  const 쪽물체 = (i) => 3 + i * 3;
  const W = Math.round(pw);
  const H = Math.round(ph);
  넣기('%PDF-1.4\n');
  자리들.push(자리);
  넣기('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  자리들.push(자리);
  넣기(`2 0 obj\n<< /Type /Pages /Kids [${장들.map((_, i) => `${쪽물체(i)} 0 R`).join(' ')}] /Count ${장들.length} >>\nendobj\n`);
  장들.forEach((one, i) => {
    const p = 쪽물체(i);
    const 그리기 = `q\n${W} 0 0 ${H} 0 0 cm\n/Im0 Do\nQ\n`;
    자리들.push(자리);
    넣기(`${p} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>\nendobj\n`);
    자리들.push(자리);
    넣기(`${p + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(one.w)} /Height ${Math.round(one.h)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${one.jpeg.length} >>\nstream\n`);
    넣기(one.jpeg);
    넣기('\nendstream\nendobj\n');
    자리들.push(자리);
    넣기(`${p + 2} 0 obj\n<< /Length ${그리기.length} >>\nstream\n${그리기}endstream\nendobj\n`);
  });
  const xref = 자리;
  let 표 = `xref\n0 ${자리들.length + 1}\n0000000000 65535 f \n`;
  for (const at of 자리들) 표 += `${String(at).padStart(10, '0')} 00000 n \n`;
  표 += `trailer\n<< /Size ${자리들.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  넣기(표);
  const out = new Uint8Array(자리);
  let at = 0;
  for (const b of 조각) { out.set(b, at); at += b.length; }
  return out;
}

// 배율 4 ≈ 288dpi.
export async function PDF만들기(모양, 인감, 배율 = 4) {
  await 글꼴준비();
  const 판 = document.createElement('canvas');
  판.width = Math.round(쪽.w * 배율);
  판.height = Math.round(쪽.h * 배율);
  const ctx = 판.getContext('2d');
  ctx.scale(배율, 배율);
  const 수 = 쪽수(ctx, 모양);
  const 장들 = [];
  for (let i = 0; i < 수; i += 1) {
    칠하기(ctx, 모양, 인감, i);
    const blob = await new Promise((done) => 판.toBlob(done, 'image/jpeg', 0.92));
    장들.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: 판.width, h: 판.height });
  }
  return new Blob([여러장PDF(장들, 쪽.w, 쪽.h)], { type: 'application/pdf' });
}

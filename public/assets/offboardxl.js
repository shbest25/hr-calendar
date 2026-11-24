// 모두싸인 퇴직서류 대량 전송 엑셀(2026-11-23). 브라우저에서 만든다.
// 머리 두 줄은 계약서 엑셀(contractxl.js 의 대량전송표)과 같은 꼴이고, 추가 내용 일곱 칸의 자리는 설정의 번호표를 따른다.
import { 대량전송표 } from './contractxl.js';
import { 엑셀만들기, 엑셀받기, 파일이름 } from './xlsxmake.js';
import { 기본번호, 번호표문제, 퇴직서류막힘 } from './offboardcalc.js';

const 글 = (v) => String(v ?? '').trim();

// 'YYYY-MM-DD' → 'YYYY년 MM월 DD일'
export function 한글날(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(글(ymd));
  return m ? `${m[1]}년 ${m[2]}월 ${m[3]}일` : '';
}

// '직책 / 직군', 직책이 비면 직군만.
export function 직책직군(rec) {
  const a = 글(rec?.title);
  const b = 글(rec?.job_group);
  return a && b ? `${a} / ${b}` : a || b;
}

const 회사이름 = (settings) => 글(settings?.company?.short) || 글(settings?.company?.name) || '우리회사';
const 번호표 = (settings) => (번호표문제(settings?.offboard?.modusign) ? 기본번호 : settings.offboard.modusign);

// 엑셀 한 줄: { 문서명, 이름, 이메일, texts[7] }. rec: 퇴직자 기록.
export function 모두싸인줄(rec, settings) {
  const 이름 = 글(rec?.name);
  const 사번 = 글(rec?.emp_no);
  const 값 = {
    소속부서: 글(rec?.dept), 직책직군: 직책직군(rec), 사번, 성명: 이름,
    입사일: 한글날(글(rec?.join_date) || 글(rec?.group_join_date)), 동의서사번: 사번, 동의서성명: 이름,
  };
  const texts = Array(7).fill('');
  for (const [키, 번호] of Object.entries(번호표(settings))) texts[Number(번호) - 1] = 값[키] ?? '';
  return { 문서명: `[${회사이름(settings)}] 퇴직서류_${이름}`, 이름, 이메일: 글(rec?.email), texts };
}

export const 퇴직서류파일이름 = (rec, settings) => 파일이름(`[${회사이름(settings)}] 퇴직서류_${글(rec?.name)}`) + '.xlsx';

// 엑셀을 만들어 내려받는다. 막혀 있으면 까닭을 담아 던진다. 돌려줌: 파일 이름.
export function 퇴직서류받기(rec, settings) {
  const 막힘 = 퇴직서류막힘(rec);
  if (막힘) throw new Error(막힘);
  const 이름 = 퇴직서류파일이름(rec, settings);
  엑셀받기(엑셀만들기(대량전송표([모두싸인줄(rec, settings)])), 이름);
  return 이름;
}

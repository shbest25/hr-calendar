// 증명서 글 만들기 — 순수 함수만 둔다. 화면 미리보기와 PDF(certpaint.js)가 같은 글을 쓴다.
import { 날짜글, 기간글, DATE } from './autotext.js';

export { 날짜글, 기간글 };

const 주민꼴 = /^(\d{6})-?(\d)(\d{6})$/;

// 뒤 6자리를 가린다. 주민번호 꼴이 아니면 적은 그대로(앞 6자리-1자리만 적은 경우 등).
export function 주민가림(rrn) {
  const t = String(rrn ?? '').trim();
  const m = 주민꼴.exec(t);
  if (m) return `${m[1]}-${m[2]}******`;
  const half = /^(\d{6})-?(\d)\*{0,6}$/.exec(t);
  return half ? `${half[1]}-${half[2]}******` : t;
}

// 면접확인서 제목. 전형이 '면접' 이면 '면접 확인서', 아니면 '채용 전형 참석 확인서'.
export function 전형제목(전형) {
  return String(전형 ?? '').trim() === '면접' ? '면접 확인서' : '채용 전형 참석 확인서';
}

export function 면접본문({ 전형일, 전형 }) {
  return `상기인이 당사에 입사 지원하여 ${날짜글(전형일)} ${String(전형 ?? '').trim() || '면접'}에 참여하였음을 확인합니다.`;
}

export function 취업본문({ 지원일 }) {
  return `상기인이 당사에 ${날짜글(지원일)}에 입사지원하였음을 확인합니다.`;
}

// 재직·경력증명서 맨 아래 문구.
export function 증명문구(kind) {
  return kind === 'employ' ? '위의 사람이 당사에 재직하고 있음을 증명합니다.' : '위와 같이 경력을 증명합니다.';
}

export function 휴직글({ 구분, 시작, 종료 } = {}) {
  const 이름 = String(구분 ?? '').trim();
  const 기간 = DATE.test(시작 ?? '') ? 기간글(시작, 종료) : '';
  if (!이름 && !기간) return '';
  return [이름, 기간 ? `(${기간})` : ''].filter(Boolean).join(' ');
}

// 발급번호: 해-일련번호(4자리). 같은 해의 발급대장 줄 수 + 1.
export const 발급번호 = (year, seq) => `${year}-${String(seq).padStart(4, '0')}`;

export const 종류 = [
  ['interview', '면접확인서'],
  ['jobseek', '취업활동 증명서'],
  ['employ', '재직증명서'],
  ['career', '경력증명서'],
];
export const 종류이름 = Object.fromEntries(종류);
export const 지원자종류 = new Set(['interview', 'jobseek']);

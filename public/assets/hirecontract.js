// 명부 등재 서랍의 '전자계약서 엑셀' 칸. 대량 전송 엑셀을 브라우저에서 만들어 내려받는다.
// 연봉은 기록에 남기지 않는 값이라 저장소로 보내지 않는다 — 서랍에 적힌 값으로 여기서 바로 만든다.
// 명부 등재를 실행하면 서랍이 새로 열리며 연봉 칸이 빈다. 그래서 '명부 등재 완료 때 함께 받기' 를 두고,
// 실행 직전에 읽어 둔 값(snap)으로 실행이 끝난 뒤 받는다(hireview.js 의 runTasks).
import { el } from './dom.js';
import { icon } from './icons.js';
import { toast } from './ui.js';
import { 계약서줄, 입력모으기, 대량전송표, 규칙으로, 종류이름 } from './contractxl.js';
import { 엑셀만들기, 엑셀받기, 파일이름 } from './xlsxmake.js';

const 원 = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

// snap: { d, 연봉 }. 막히면 { blocked }, 받았으면 계약서줄.
export function 계약서엑셀받기(snap, settings) {
  const 줄 = 계약서줄(입력모으기(snap?.d, snap?.연봉), 규칙으로(settings));
  if (줄.blocked) return 줄;
  엑셀받기(엑셀만들기(대량전송표([줄])), 줄.문서명);
  return 줄;
}

// 서랍 안의 칸. readData 는 지금 적힌 입사자 값을 준다. watch 는 값이 바뀔 때 상태 줄을 새로 쓰려고 듣는 곳(폼).
export function contractSection({ readData, settings, watch, readOnly = false }) {
  const 상태 = el('p', { class: 'lead-muted hc-state' });
  const 연봉칸 = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '예: 42000000 (숫자만)', 'aria-label': '연봉', disabled: readOnly });
  const 함께 = el('input', { type: 'checkbox', 'aria-label': '명부 등재 완료 때 함께 받기', disabled: readOnly });
  함께.checked = true;
  const 단추 = el('button', { type: 'button', class: 'btn ghost sm', disabled: readOnly }, icon('download'), '엑셀 받기');
  const 요약 = el('div', { class: 'hc-sum' });

  const snap = () => ({ d: readData(), 연봉: 연봉칸.value });
  const 살피기 = () => {
    const 줄 = 계약서줄(입력모으기(readData(), 연봉칸.value), 규칙으로(settings));
    if (줄.blocked) {
      상태.textContent = 줄.blocked;
      상태.classList.add('form-error');
      단추.disabled = true;
      요약.replaceChildren();
      return 줄;
    }
    상태.textContent = `${종류이름[줄.kind]} 템플릿 · 추가 내용 ${줄.texts.length}칸을 채웁니다. 파일 이름: ${파일이름(줄.문서명)}.xlsx`;
    상태.classList.remove('form-error');
    단추.disabled = readOnly;
    요약.replaceChildren(
      el('span', {}, '월 급여 ', el('b', {}, 원(줄.요약.월급여))),
      el('span', {}, '기본급 ', el('b', {}, 원(줄.요약.기본급))),
      el('span', {}, '연봉계약 끝 ', el('b', {}, 줄.요약.연봉끝)),
      el('span', {}, '수습 끝 ', el('b', {}, 줄.요약.수습끝)));
    return 줄;
  };
  단추.addEventListener('click', () => {
    const 줄 = 계약서엑셀받기(snap(), settings);
    if (줄.blocked) toast(줄.blocked, { error: true });
    else toast('계약서 엑셀을 받았습니다. 전자계약 대량 전송에 올려 주세요');
  });
  연봉칸.addEventListener('input', 살피기);
  for (const type of ['input', 'change']) watch?.addEventListener(type, 살피기);
  살피기();

  const node = el('section', { class: 'hire-sec hc' },
    el('div', { class: 'ht-head' },
      el('h3', { class: 'hire-sec-title' }, '전자계약서 엑셀'),
      el('span', { class: 'ht-sub' }, '근로·연봉계약서 대량 전송 엑셀을 만듭니다. 연봉은 저장하지 않고 파일에만 들어갑니다.')),
    el('label', { class: 'field hc-pay' }, el('span', { class: 'f-label' }, '연봉(원)'), 연봉칸),
    상태,
    요약,
    el('div', { class: 'hc-foot' },
      el('label', { class: 'check hc-with' }, 함께, el('span', {}, '명부 등재 완료 때 함께 받기')),
      단추));
  // 이 칸의 값은 입사자 값이 아니다. 서랍의 미리보기 새로 고침을 깨우지 않게 여기서 멈춘다.
  for (const type of ['input', 'change']) node.addEventListener(type, (e) => e.stopPropagation());

  return {
    node,
    snap,
    // 명부 등재가 끝난 뒤 부른다. snap 은 실행 직전에 읽어 둔 값이다(그 뒤 서랍이 새로 열려 연봉이 빈다).
    afterEnroll(saved) {
      if (!함께.checked) return;
      const 줄 = 계약서엑셀받기(saved, settings);
      if (줄.blocked) toast(`계약서 엑셀은 받지 못했습니다: ${줄.blocked}`, { error: true });
      else toast('계약서 엑셀도 함께 받았습니다');
    },
  };
}

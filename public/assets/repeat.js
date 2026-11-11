// 날짜 계산. 순수 함수만 둔다 — 브라우저(로컬 저장 모드)와 서버(functions/)가 같은 파일을 쓴다.
// 시간대 문제를 피하려고 날짜는 늘 'YYYY-MM-DD' 글자로 다루고, Date 는 로컬 기준으로만 만든다.

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const monthOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
export const parse = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10) || 1));
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();

// 그 달의 격자: 1일이 든 주의 일요일부터, 말일이 든 주의 토요일까지 7일씩.
export function weeksOf(month) {
  const first = parse(month + '-01');
  const start = addDays(first, -first.getDay());
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    weeks.push([...Array(7)].map((_, i) => addDays(start, w * 7 + i)));
    const next = addDays(start, (w + 1) * 7);
    if (monthOf(next) !== month && next > first) break;
  }
  return weeks;
}

// 이 날이 규칙에 맞는 날인가(휴일 옮기기 전).
function occurs(item, d, holidaySet) {
  const key = ymd(d);
  if (item.start_date && key < item.start_date) return false;
  if (item.end_date && key > item.end_date) return false;
  const y = d.getFullYear();
  const m0 = d.getMonth();
  const day = d.getDate();
  const dow = d.getDay();
  const dim = daysInMonth(y, m0);
  const onDay = Math.min(item.on_day || 1, dim); // 31일로 정했는데 그 달이 30일까지면 말일로
  switch (item.repeat_kind) {
    case 'none': return key === item.start_date;
    case 'daily': return true;
    case 'workday': return dow >= 1 && dow <= 5 && !holidaySet.has(key);
    case 'weekly': return dow === (item.on_weekday ?? 1);
    case 'monthly': return day === onDay;
    case 'quarterly': {
      // 시작일이 있으면 그 달을 기준으로 3개월마다, 없으면 1·4·7·10월.
      const anchor = item.start_date ? Number(item.start_date.slice(5, 7)) - 1 : 0;
      return day === onDay && ((m0 - anchor) % 3 + 3) % 3 === 0;
    }
    case 'yearly': return m0 === (item.on_month || 1) - 1 && day === onDay;
    case 'month_end': return day === dim;
    default: return false;
  }
}

const isOff = (d, holidaySet) => d.getDay() === 0 || d.getDay() === 6 || holidaySet.has(ymd(d));

// 기한이 주말·공휴일이면 규칙대로 옮긴다.
function shift(d, rule, holidaySet) {
  if (rule !== 'before' && rule !== 'after') return d;
  let x = d;
  for (let i = 0; i < 10 && isOff(x, holidaySet); i++) x = addDays(x, rule === 'before' ? -1 : 1);
  return x;
}

// 규칙 목록을 그 달의 '회차' 목록으로 펼친다. 돌려주는 것: [{ ...item, due }]
// 옮긴 날짜가 달을 넘나들 수 있어 앞뒤로 열흘씩 더 보고 그 달에 든 것만 남긴다.
export function expandMonth(items, month, holidays = []) {
  const holidaySet = new Set(holidays.map((h) => h.date));
  const first = parse(month + '-01');
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const from = addDays(first, -10);
  const to = addDays(last, 10);
  const out = [];
  const seen = new Set();
  for (const item of items) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!occurs(item, d, holidaySet)) continue;
      const due = ymd(shift(d, item.holiday_rule, holidaySet));
      if (due.slice(0, 7) !== month) continue;
      const k = item.id + '|' + due;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...item, due });
    }
  }
  out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.title.localeCompare(b.title, 'ko')));
  return out;
}

export const holidaysOf = (holidays, month) => holidays.filter((h) => h.date.startsWith(month));

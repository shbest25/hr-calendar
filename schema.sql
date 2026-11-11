-- Cloudflare D1 테이블. 한 번만 실행한다:
--   npx wrangler d1 execute hr-calendar --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'etc',
  repeat_kind   TEXT NOT NULL DEFAULT 'none',
  on_weekday    INTEGER NOT NULL DEFAULT 1,
  on_day        INTEGER NOT NULL DEFAULT 1,
  on_month      INTEGER NOT NULL DEFAULT 1,
  start_date    TEXT,
  end_date      TEXT,
  holiday_rule  TEXT NOT NULL DEFAULT 'keep',
  lead          TEXT,
  deputy        TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL
);

-- 완료 표시는 '어느 일정의 어느 날 회차' 단위로 남긴다.
CREATE TABLE IF NOT EXISTS done (
  item_id TEXT NOT NULL,
  due     TEXT NOT NULL,
  PRIMARY KEY (item_id, due)
);

CREATE TABLE IF NOT EXISTS categories (
  key   TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  pos   INTEGER NOT NULL
);

-- 자동화 기록(신규 입사자·직원명부·증명서 발급대장·실행 내역·설정). data 는 JSON 글자.
CREATE TABLE IF NOT EXISTS records (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_kind ON records (kind);

INSERT OR IGNORE INTO categories (key, label, color, pos) VALUES
  ('payroll',   '급여',     '#2E7D32', 0),
  ('tax',       '세무',     '#6A1B9A', 1),
  ('insurance', '인사행정', '#0277BD', 2),
  ('settle',    '용역관리', '#8D6E63', 3),
  ('welfare',   '복지',     '#AD1457', 4),
  ('onboard',   '입·퇴사',  '#4527A0', 5),
  ('attend',    '근태',     '#558B2F', 6),
  ('recruit',   '채용',     '#EF6C00', 7),
  ('eval',      '평가',     '#C62828', 8),
  ('training',  '교육',     '#00838F', 9),
  ('etc',       '기타',     '#616161', 10);

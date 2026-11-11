-- Supabase(Postgres) 테이블. Supabase 대시보드 → SQL Editor 에 전체를 붙여 넣고 Run 한 번.
-- 여러 번 실행해도 안전하다(이미 있으면 건너뛰거나 다시 만든다).
--
-- 권한 규칙(RLS):
--   · 누구나 읽을 수 있다(anon 키만으로)              → 포트폴리오 방문자는 보기만 한다
--   · 로그인한 사용자만 추가·수정·삭제할 수 있다        → Authentication 에 등록한 관리자만

create table if not exists items (
  id            text primary key,
  title         text not null,
  category      text not null default 'etc',
  repeat_kind   text not null default 'none',
  on_weekday    integer not null default 1,
  on_day        integer not null default 1,
  on_month      integer not null default 1,
  start_date    text,
  end_date      text,
  holiday_rule  text not null default 'keep',
  lead          text,
  deputy        text,
  note          text,
  created_at    timestamptz not null default now()
);

-- 완료 표시는 '어느 일정의 어느 날 회차' 단위. 일정을 지우면 같이 지워진다.
create table if not exists done (
  item_id text not null references items(id) on delete cascade,
  due     text not null,
  primary key (item_id, due)
);

create table if not exists categories (
  key   text primary key,
  label text not null,
  color text not null,
  pos   integer not null
);

insert into categories (key, label, color, pos) values
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
  ('etc',       '기타',     '#616161', 10)
on conflict (key) do nothing;

-- 포트폴리오용 보기 일정(가공 데이터). 필요 없으면 이 블록은 지우고 실행해도 된다.
insert into items (id, title, category, repeat_kind, on_day, on_weekday, on_month, start_date, holiday_rule, lead, deputy, note) values
  ('cal_sample01', '정기급여 기반자료 제작',          'payroll',   'monthly',   16, 1, 1, null,         'before', '김담당', '이담당', null),
  ('cal_sample02', '정기급여 공지 및 급여명세서 발송', 'payroll',   'monthly',   23, 1, 1, null,         'before', '김담당', null,     null),
  ('cal_sample03', '정기급여 품의 및 이체등록',        'payroll',   'monthly',   27, 1, 1, null,         'before', '김담당', '이담당', null),
  ('cal_sample04', '원천세 신고자료 공유',            'tax',       'monthly',   5,  1, 1, null,         'after',  '이담당', null,     null),
  ('cal_sample05', '4대보험 정산자료 제작',           'insurance', 'monthly',   6,  1, 1, null,         'keep',   '이담당', null,     null),
  ('cal_sample06', '복지카드 청구내역 공유',          'welfare',   'monthly',   6,  1, 1, null,         'keep',   '김담당', null,     null),
  ('cal_sample07', '복지카드 한도부여',               'welfare',   'month_end', 1,  1, 1, null,         'before', '김담당', null,     null),
  ('cal_sample08', '용역 세금계산서 정산',            'settle',    'monthly',   16, 1, 1, null,         'keep',   '박담당', null,     null),
  ('cal_sample09', '주간 인사 회의',                  'etc',       'weekly',    1,  1, 1, null,         'keep',   '팀 전체', null,    null),
  ('cal_sample10', '분기 법정의무교육 안내',          'training',  'quarterly', 10, 1, 1, '2026-01-10', 'keep',   '박담당', null,     null),
  ('cal_sample11', '연간 평가 일정 안내',             'eval',      'yearly',    1,  1, 12, null,        'keep',   '김담당', null,     null)
on conflict (id) do nothing;

-- 자동화 기록: 신규 입사자(hire)·직원명부(staff)·증명서 발급대장(cert)·실행 내역(run)·설정(settings).
-- 모양이 자주 바뀌는 자료라 JSON 한 칸에 둔다.
create table if not exists records (
  id         text primary key,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists records_kind on records (kind);

-- ---------- 권한 규칙 ----------
alter table items      enable row level security;
alter table done       enable row level security;
alter table categories enable row level security;
alter table records    enable row level security;

drop policy if exists "anyone can read items"      on items;
drop policy if exists "anyone can read done"       on done;
drop policy if exists "anyone can read categories" on categories;
drop policy if exists "signed-in can write items"      on items;
drop policy if exists "signed-in can write done"       on done;
drop policy if exists "signed-in can write categories" on categories;

create policy "anyone can read items"      on items      for select using (true);
create policy "anyone can read done"       on done       for select using (true);
create policy "anyone can read categories" on categories for select using (true);

create policy "signed-in can write items"      on items      for all to authenticated using (true) with check (true);
create policy "signed-in can write done"       on done       for all to authenticated using (true) with check (true);
create policy "signed-in can write categories" on categories for all to authenticated using (true) with check (true);

-- 기록에는 입사자 연락처·이메일이 들어간다 → 설정(rec_settings)만 누구나 읽고, 나머지는 로그인한 사람만 읽고 쓴다.
drop policy if exists "anyone can read settings"   on records;
drop policy if exists "anyone can read org"        on records;
drop policy if exists "signed-in can read records" on records;
drop policy if exists "signed-in can write records" on records;
create policy "anyone can read settings"    on records for select using (id = 'rec_settings');
-- 조직도는 사내 누구나 본다. TO표(to)·평가 현황(eval)·입사자(hire)·명부(staff)는 로그인한 사람만.
create policy "anyone can read org"         on records for select using (kind = 'org');
create policy "signed-in can read records"  on records for select to authenticated using (true);
create policy "signed-in can write records" on records for all to authenticated using (true) with check (true);

-- 분야 목록을 통째로 바꾸는 함수(지우고 다시 넣기를 한 번에). 로그인한 사용자만 부를 수 있다.
create or replace function replace_categories(cats jsonb)
returns setof categories
language plpgsql
security invoker
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception '로그인해야 분야를 바꿀 수 있습니다.';
  end if;
  delete from categories;
  insert into categories (key, label, color, pos)
    select c->>'key', c->>'label', c->>'color', (ord - 1)::integer
    from jsonb_array_elements(cats) with ordinality as t(c, ord);
  return query select * from categories order by pos;
end
$$;

grant execute on function replace_categories(jsonb) to authenticated;

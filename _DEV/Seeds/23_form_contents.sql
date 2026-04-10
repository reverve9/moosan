-- ============================================================================
-- 23_form_contents.sql
-- 참가신청 폼 콘텐츠 관리 테이블 + 초기 시드
-- ============================================================================

create table if not exists public.form_contents (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs(id) on delete cascade,
  field_key   text not null,
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (program_id, field_key)
);

-- RLS: 읽기 전체 허용, 쓰기도 허용 (어드민은 anon key 사용)
alter table form_contents enable row level security;

create policy "form_contents_read" on form_contents for select using (true);
create policy "form_contents_write" on form_contents for insert with check (true);
create policy "form_contents_update" on form_contents for update using (true);
create policy "form_contents_delete" on form_contents for delete using (true);

-- ============================================================================
-- 초기 시드 — 현재 하드코딩된 텍스트를 DB로 이관
-- program_id 는 실행 시 programs 테이블에서 조회
-- ============================================================================

-- 공통 notice (모든 프로그램 동일)
INSERT INTO form_contents (program_id, field_key, content)
SELECT p.id, 'notice',
'본 신청서는 원활한 대회 운영을 위해 사용됩니다.
정확한 정보가 기재될 수 있도록 지도교사 및 대표자께서는 내용을 확인 후 제출해주시기 바랍니다.

잘못된 정보로 인해 발생하는 불이익은 주최 측에서 책임지지 않습니다.'
FROM programs p
WHERE p.slug IN ('dance', 'baekiljang', 'saesaeng', 'choir')
ON CONFLICT (program_id, field_key) DO NOTHING;

-- 공통 privacy_items
INSERT INTO form_contents (program_id, field_key, content)
SELECT p.id, 'privacy_items',
'이름, 연락처, 주소, 생년월일, 통장사본 등'
FROM programs p
WHERE p.slug IN ('dance', 'baekiljang', 'saesaeng', 'choir')
ON CONFLICT (program_id, field_key) DO NOTHING;

-- 공통 privacy_purpose
INSERT INTO form_contents (program_id, field_key, content)
SELECT p.id, 'privacy_purpose',
'대회 참가신청서 작성 시 참가팀이 제공한 자료 및 추후 자료 지급에 한하여 대회 운영을 목적으로 수집하며 이외의 목적으로 사용하지 않습니다.'
FROM programs p
WHERE p.slug IN ('dance', 'baekiljang', 'saesaeng', 'choir')
ON CONFLICT (program_id, field_key) DO NOTHING;

-- 공통 privacy_retention
INSERT INTO form_contents (program_id, field_key, content)
SELECT p.id, 'privacy_retention',
'저장 된 개인정보는 수집 및 이용목적이 달성되면 파기합니다.'
FROM programs p
WHERE p.slug IN ('dance', 'baekiljang', 'saesaeng', 'choir')
ON CONFLICT (program_id, field_key) DO NOTHING;

-- 공통 rules
INSERT INTO form_contents (program_id, field_key, content)
SELECT p.id, 'rules',
'본 참가자는 대회 일정 및 운영 방침을 준수합니다.
참가 신청에 기재한 내용은 사실과 다를시 심사에서 제외되며, 위부 사항이 확인될 경우 참가가 취소될 수 있습니다.
대회 당일 준비물 및 시간에 맞게 도착하여야 하며, 관련 운영 변경시 사전 안내는 참가자에게만 진행됩니다.
대회 입장 리허설 및 본 공연 시간은 대회의 사정에 따라 변경 가능하며, 상세 내용은 문자발송이 진행됩니다.
천재지변, 감염병, 기타 불가항력적 사유 발생 시 대회 일정 및 방식이 변경될 수 있습니다.
대회 시 촬영된 사진 및 영상은 기록, 홍보, 보도 자료를 위해 비상업적 목적으로 활용됩니다.'
FROM programs p
WHERE p.slug IN ('dance', 'baekiljang', 'saesaeng', 'choir')
ON CONFLICT (program_id, field_key) DO NOTHING;

-- 확인
SELECT fc.field_key, p.slug, length(fc.content) as content_len
FROM form_contents fc
JOIN programs p ON p.id = fc.program_id
ORDER BY p.slug, fc.field_key;

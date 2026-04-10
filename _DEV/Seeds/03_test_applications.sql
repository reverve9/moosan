-- ============================================
-- 테스트 참가신청 데이터 — 대회당 5건씩 (총 20건)
-- 02_programs.sql 실행 후 실행
-- ============================================

-- 기존 더미 제거
DELETE FROM applications WHERE phone IN (
  '01012345678','01098765432','01055556666','01033334444',
  '01010000001','01010000002','01010000003','01010000004','01010000005',
  '01020000001','01020000002','01020000003','01020000004','01020000005',
  '01030000001','01030000002','01030000003','01030000004','01030000005',
  '01040000001','01040000002','01040000003','01040000004','01040000005'
);

-- ============================================
-- 백일장 (baekiljang) — 5건
-- ============================================

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '중등부', 'individual', '김민서', '100315', '속초중학교', '01010000001', 'minso@test.com', true, now(), 'pending',
  '{"gender":"여","address":"강원 속초시 중앙로 100","work_type":"산문"}'::jsonb
FROM programs WHERE slug = 'baekiljang';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '고등부', 'individual', '이준혁', '080722', '양양고등학교', '01010000002', 'junhyuk@test.com', true, now(), 'approved',
  '{"gender":"남","address":"강원 양양군 양양읍 남문로 55","work_type":"운문"}'::jsonb
FROM programs WHERE slug = 'baekiljang';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '중등부', 'individual', '박서연', '110430', '고성중학교', '01010000003', 'seoyeon@test.com', true, now(), 'pending',
  '{"gender":"여","address":"강원 고성군 토성면 원암리 12","work_type":"산문"}'::jsonb
FROM programs WHERE slug = 'baekiljang';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '고등부', 'individual', '최도윤', '070915', '속초고등학교', '01010000004', 'doyun@test.com', true, now(), 'rejected',
  '{"gender":"남","address":"강원 속초시 설악로 200","work_type":"운문"}'::jsonb
FROM programs WHERE slug = 'baekiljang';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '중등부', 'individual', '정하은', '100108', '인제중학교', '01010000005', 'haeun@test.com', true, now(), 'approved',
  '{"gender":"여","address":"강원 인제군 인제읍 비봉로 88","work_type":"산문"}'::jsonb
FROM programs WHERE slug = 'baekiljang';

-- ============================================
-- 사생대회 (saesaeng) — 5건
-- ============================================

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, parent_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '미취학', 'individual', '이서윤', '200520', '해돋이어린이집', '01020000001', NULL, '01020100001', true, now(), 'pending',
  '{"gender":"여","address":"강원 속초시 설악로 50"}'::jsonb
FROM programs WHERE slug = 'saesaeng';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, parent_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '초등 저학년', 'individual', '박지호', '180312', '속초초등학교', '01020000002', NULL, '01020100002', true, now(), 'approved',
  '{"gender":"남","address":"강원 속초시 동명동 22"}'::jsonb
FROM programs WHERE slug = 'saesaeng';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, parent_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '초등 고학년', 'individual', '김하율', '160815', '양양초등학교', '01020000003', NULL, '01020100003', true, now(), 'pending',
  '{"gender":"여","address":"강원 양양군 양양읍 중앙로 15"}'::jsonb
FROM programs WHERE slug = 'saesaeng';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, parent_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '초등 저학년', 'individual', '오시우', '190110', '고성초등학교', '01020000004', NULL, '01020100004', true, now(), 'rejected',
  '{"gender":"남","address":"강원 고성군 간성읍 간성로 30"}'::jsonb
FROM programs WHERE slug = 'saesaeng';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, parent_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '미취학', 'individual', '장예린', '210603', '설악유치원', '01020000005', NULL, '01020100005', true, now(), 'approved',
  '{"gender":"여","address":"강원 속초시 중앙로 300"}'::jsonb
FROM programs WHERE slug = 'saesaeng';

-- ============================================
-- 댄스 (dance) — 5건 (팀 3 + 개인 2)
-- ============================================

INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, applicant_birth, school_name, school_grade, phone, email, teacher_name, teacher_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '중등부', 'team', '드림댄서즈', '박지훈', '091205', '양양중학교', '2학년', '01030000001', 'jihun@test.com', '최선생', '01030100001', true, now(), 'pending',
  '{"team_member_count":"총 5명 (남 2명 / 여 3명)","team_composition":"중등 5명","performance_duration":"4분 30초"}'::jsonb
FROM programs WHERE slug = 'dance';

INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, applicant_birth, school_name, school_grade, phone, email, teacher_name, teacher_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '고등부', 'team', '설악스텝', '한소희', '070830', '속초고등학교', '1학년', '01030000002', 'sohee@test.com', '김지도', '01030100002', true, now(), 'approved',
  '{"team_member_count":"총 8명 (남 3명 / 여 5명)","team_composition":"고등 8명","performance_duration":"5분 10초"}'::jsonb
FROM programs WHERE slug = 'dance';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, school_grade, phone, email, teacher_name, teacher_phone, parent_name, parent_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '초등부', 'individual', '윤서아', '150420', '속초초등학교', '5학년', '01030000003', NULL, '박선생', '01030100003', '윤보호', '01030200003', true, now(), 'pending',
  '{"performance_duration":"3분 20초"}'::jsonb
FROM programs WHERE slug = 'dance';

INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, applicant_birth, school_name, school_grade, phone, email, teacher_name, teacher_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '중등부', 'team', '비트크루', '정태현', '100115', '고성중학교', '3학년', '01030000004', 'taehyun@test.com', '이코치', '01030100004', true, now(), 'rejected',
  '{"team_member_count":"총 6명 (남 4명 / 여 2명)","team_composition":"중등 6명","performance_duration":"4분 50초"}'::jsonb
FROM programs WHERE slug = 'dance';

INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, school_grade, phone, email, parent_name, parent_phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '고등부', 'individual', '강다은', '080605', '양양고등학교', '2학년', '01030000005', 'daeun@test.com', '강보호', '01030200005', true, now(), 'approved',
  '{"performance_duration":"3분 40초"}'::jsonb
FROM programs WHERE slug = 'dance';

-- ============================================
-- 합창 (choir) — 5건
-- ============================================

INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, school_name, phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '초등부', 'team', '설악어린이합창단', '정대표', '속초초등학교', '01040000001', true, now(), 'pending',
  '{"choir_composition":"혼성","choir_region":"강원 속초시","member_count":"22","conductor_name":"김지휘","accompanist_name":"이반주","award_address":"강원 속초시 중앙로 200","songs":[{"title":"아름다운 나라","composer":"김작곡/이작사","duration":"3분 20초"},{"title":"설악의 노래","composer":"박작곡/최작사","duration":"4분 10초"}]}'::jsonb
FROM programs WHERE slug = 'choir';

INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, school_name, phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '중등부', 'team', '양양청소년합창단', '이단장', '양양중학교', '01040000002', true, now(), 'approved',
  '{"choir_composition":"여성","choir_region":"강원 양양군","member_count":"30","conductor_name":"박지휘","accompanist_name":"최건반","award_address":"강원 양양군 양양읍 남문로 100","songs":[{"title":"봄의 왈츠","composer":"정작곡/한작사","duration":"3분 50초"},{"title":"희망의 노래","composer":"이작곡/김작사","duration":"4분 30초"}]}'::jsonb
FROM programs WHERE slug = 'choir';

INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, school_name, phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '고등부', 'team', '고성하모니', '김회장', '고성고등학교', '01040000003', true, now(), 'pending',
  '{"choir_composition":"혼성","choir_region":"강원 고성군","member_count":"25","conductor_name":"송지휘","accompanist_name":"강피아노","award_address":"강원 고성군 간성읍 간성로 50","songs":[{"title":"함께 걸어요","composer":"최작곡/박작사","duration":"4분 00초"},{"title":"바다의 꿈","composer":"홍작곡/윤작사","duration":"3분 40초"}]}'::jsonb
FROM programs WHERE slug = 'choir';

INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, school_name, phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '초등부', 'team', '인제꿈나무합창단', '박총무', '인제초등학교', '01040000004', true, now(), 'rejected',
  '{"choir_composition":"남성","choir_region":"강원 인제군","member_count":"18","conductor_name":"오지휘","accompanist_name":"한건반","award_address":"강원 인제군 인제읍 비봉로 200","songs":[{"title":"산골 아이들","composer":"임작곡/서작사","duration":"3분 10초"},{"title":"푸른 하늘","composer":"노작곡/장작사","duration":"3분 50초"}]}'::jsonb
FROM programs WHERE slug = 'choir';

INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, school_name, phone, privacy_agreed, privacy_agreed_at, status, meta)
SELECT id, '중등부', 'team', '속초시립소년소녀합창단', '최대표', '속초중학교', '01040000005', true, now(), 'approved',
  '{"choir_composition":"혼성","choir_region":"강원 속초시","member_count":"35","conductor_name":"유지휘","accompanist_name":"배반주","award_address":"강원 속초시 설악로 500","songs":[{"title":"통일의 노래","composer":"강작곡/문작사","duration":"4분 20초"},{"title":"우리의 소원","composer":"안작곡/전작사","duration":"3분 30초"}]}'::jsonb
FROM programs WHERE slug = 'choir';

-- 확인
SELECT p.slug, a.division, a.applicant_name, a.status, a.created_at
FROM applications a
JOIN programs p ON p.id = a.program_id
ORDER BY p.slug, a.created_at DESC;

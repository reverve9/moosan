-- ============================================
-- 테스트 참가신청 데이터 (프로그램별 1건씩)
-- 02_programs.sql 실행 후 실행
-- ============================================

-- 백일장 테스트 신청
INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, privacy_agreed, privacy_agreed_at, meta)
SELECT id, '중등부', 'individual', '김민서', '100315', '속초중학교', '01012345678', 'minso@test.com', true, now(),
  '{"gender":"여","address":"강원특별자치도 속초시 중앙로 100","work_type":"산문"}'::jsonb
FROM programs WHERE slug = 'baekiljang';

-- 사생대회 테스트 신청
INSERT INTO applications (program_id, division, participation_type, applicant_name, applicant_birth, school_name, phone, email, parent_phone, privacy_agreed, privacy_agreed_at, meta)
SELECT id, '초등 저학년', 'individual', '이서윤', '170520', '속초초등학교', '01098765432', 'parent@test.com', '01011112222', true, now(),
  '{"gender":"여","address":"강원특별자치도 속초시 설악로 50"}'::jsonb
FROM programs WHERE slug = 'saesaeng';

-- 댄스 테스트 신청
INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, school_name, school_grade, phone, email, teacher_name, teacher_phone, privacy_agreed, privacy_agreed_at, meta)
SELECT id, '중등부', 'team', '드림댄서즈', '박지훈', '양양중학교', '2학년', '01055556666', 'jihun@test.com', '최선생', '01077778888', true, now(),
  '{"team_member_count":"총 5명 (남 2명 / 여 3명)","team_composition":"중등 5명","performance_duration":"4분 30초"}'::jsonb
FROM programs WHERE slug = 'dance';

-- 합창 테스트 신청
INSERT INTO applications (program_id, division, participation_type, team_name, applicant_name, school_name, phone, privacy_agreed, privacy_agreed_at, meta)
SELECT id, '', 'team', '설악어린이합창단', '정대표', '', '01033334444', true, now(),
  '{"choir_composition":"혼성","choir_region":"강원특별자치도 속초시","member_count":"22","conductor_name":"김지휘","accompanist_name":"이반주","award_address":"25545 강원특별자치도 속초시 중앙로 200","songs":[{"title":"아름다운 나라","composer":"김작곡/이작사","duration":"3분 20초"},{"title":"설악의 노래","composer":"박작곡/최작사","duration":"4분 10초"}]}'::jsonb
FROM programs WHERE slug = 'choir';

-- ============================================================================
-- 19_seed_youth_programs.sql
-- 청소년문화축전 4개 행사 시드 데이터 (사생/합창/백일장/댄스)
-- ============================================================================
--
-- 배경
--  ProgramAccordion 컴포넌트가 PROGRAMS 배열로 4개 행사를 하드코딩하고 있던
--  것을 supabase fetch 로 전환하면서 (세션 15) 클라이언트엔 데이터가 없게 됨.
--  어드민에서 일일이 재입력하지 않도록 기존 인라인 데이터를 그대로 시드.
--
-- 안전 장치
--  · slug 별 NOT EXISTS 체크 → 어드민에서 이미 편집한 row 는 건드리지 않음
--  · thumbnail_url 은 기존 정적 경로 (/images/thumb_xxx.png) 그대로.
--    getAssetUrl 가 / 시작 경로를 그대로 반환하도록 수정했으므로 정상 표시.
--  · category / target_divisions / participation_type 은 NOT NULL 이라 적당히
--    추정 값 채움. 어드민에서 추후 수정 가능.
--
-- ============================================================================

DO $$
DECLARE
  youth_id UUID;
BEGIN
  SELECT id INTO youth_id FROM festivals WHERE slug = 'youth' LIMIT 1;
  IF youth_id IS NULL THEN
    RAISE NOTICE 'youth festival not found, skipping seed';
    RETURN;
  END IF;

  -- ── 1) 전국 어린이 사생대회 ──────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'saesaeng') THEN
    INSERT INTO programs (
      festival_id, slug, name, category, target_divisions, participation_type,
      description, thumbnail_url, event_name, schedule, venue, target_text,
      awards_text, registration_period, application_method, sort_order, is_active
    ) VALUES (
      youth_id, 'saesaeng', '전국 어린이 사생대회',
      'art', ARRAY['초등']::TEXT[], 'individual',
      '전국 어린이 사생대회는 2025년도 제3회 설악청소년문화축전 행사의 하나로, 전국의 미취학아동 및 초등학생을 대상으로 열리는 문화예술 경연 행사입니다.',
      '/images/thumb_sasaeng.png',
      '2025 설악청소년문화축전 전국 어린이 사생대회',
      '2025년 5월 24일(토) 오후 1시 ~ 3시 30분',
      '속초시 청호호수공원 및 엑스포광장 일대',
      '대한민국 거주 미취학 아동 및 초등학생(어린이집, 유치원, 초등학교)',
      '강원특별자치도지사/도의회의장상, 속초시장상, 고성교육지원교육장상 등',
      '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
      '아래 ''접수하기''에 링크된 신청양식을 통해 접수',
      10, true
    );
  END IF;

  -- ── 2) 전국 어린이 합창대회 ──────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'choir') THEN
    INSERT INTO programs (
      festival_id, slug, name, category, target_divisions, participation_type,
      description, thumbnail_url, event_name, schedule, venue, target_text,
      awards_text, registration_period, application_method, sort_order, is_active
    ) VALUES (
      youth_id, 'choir', '전국 어린이 합창대회',
      'choir', ARRAY['초등']::TEXT[], 'team',
      '2025 전국 어린이 합창대회는 제3회 설악청소년문화축전 행사의 하나로, 전국의 어린이합창단을 속초로 초청, 경연하여 지역 문화 발전에 기여하는 행사입니다.',
      '/images/thumb_choir.png',
      '2025 설악청소년문화축전 전국 어린이 합창대회',
      '2025년 5월 23일(금) 오후 5시 ~ 7시 30분',
      '속초시 청호호수공원 엑스포광장 특설무대',
      E'미취학 아동 및 초등학교에 재학 중인 어린이\n최소 8명 ~ 최대 50명 이내로 구성된 합창단',
      '강원특별자치도지사상, 속초시장상 등',
      '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
      '아래 ''접수하기''에 링크된 신청양식을 통해 접수',
      20, true
    );
  END IF;

  -- ── 3) 전국 청소년 백일장 ────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'baekiljang') THEN
    INSERT INTO programs (
      festival_id, slug, name, category, target_divisions, participation_type,
      description, thumbnail_url, event_name, schedule, venue, target_text,
      awards_text, registration_period, application_method, sort_order, is_active
    ) VALUES (
      youth_id, 'baekiljang', '전국 청소년 백일장',
      'writing', ARRAY['중고']::TEXT[], 'individual',
      '전국 청소년 백일장은 2025 설악청소년문화축전 행사의 하나로, 전국의 중·고등학생을 대상으로 운문과 산문 두 부문에 걸쳐 열리는 문화예술행사입니다.',
      '/images/thumb_baekiljang.png',
      '2025 설악청소년문화축전 전국 청소년 백일장',
      '2025년 5월 24일(토) 오후 2시 ~ 4시 30분',
      '속초시 청호호수공원 및 엑스포광장 일대',
      '대한민국 거주 중·고등학생 혹은 해당 연령 개인',
      '강원특별자치도지사상, 도의회의장상, 속초양양/고성 교육지원청교육장상 등',
      '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
      '아래 ''접수하기''에 링크된 신청양식을 통해 접수',
      30, true
    );
  END IF;

  -- ── 4) 전국 청소년 스트리트댄스 페스티벌 ─────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM programs WHERE slug = 'dance') THEN
    INSERT INTO programs (
      festival_id, slug, name, category, target_divisions, participation_type,
      description, thumbnail_url, event_name, schedule, venue, target_text,
      awards_text, registration_period, application_method, sort_order, is_active
    ) VALUES (
      youth_id, 'dance', '전국 청소년 스트리트댄스 페스티벌',
      'dance', ARRAY['중고']::TEXT[], 'team',
      '전국 청소년 스트리트댄스 페스티벌은 2025 설악청소년문화축전의 메인이벤트로서, 전국의 청소년 댄서나 댄스팀의 경연을 통해 문화 체험의 기회를 확대하고 지역 문화 발전에 기여하고자 합니다.',
      '/images/thumb_dance.png',
      '2025 전국 청소년 스트리트댄스 페스티벌',
      '2025년 5월 25일(일) 오후 5시 ~ 7시',
      '속초시 청호호수공원 엑스포광장 특설무대',
      '중·고등학생 최소 2명 ~ 최대 20명 이하로 구성된 동아리, 팀',
      '강원특별자치도의회의장상, 속초시장상 등',
      '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
      '아래 ''접수하기''에 링크된 신청양식을 통해 접수',
      40, true
    );
  END IF;

  -- ── NULL fix: 위 NOT EXISTS 가 INSERT 를 막은 케이스 (사전에 빈 row 가
  --    festival_id NULL 로 미리 존재했던 환경) 에서도 youth 매핑 + 썸네일 보장.
  UPDATE programs
  SET festival_id = youth_id
  WHERE slug IN ('saesaeng', 'choir', 'baekiljang', 'dance')
    AND festival_id IS NULL;

  UPDATE programs SET thumbnail_url = '/images/thumb_sasaeng.png'
    WHERE slug = 'saesaeng' AND thumbnail_url IS NULL;
  UPDATE programs SET thumbnail_url = '/images/thumb_choir.png'
    WHERE slug = 'choir' AND thumbnail_url IS NULL;
  UPDATE programs SET thumbnail_url = '/images/thumb_baekiljang.png'
    WHERE slug = 'baekiljang' AND thumbnail_url IS NULL;
  UPDATE programs SET thumbnail_url = '/images/thumb_dance.png'
    WHERE slug = 'dance' AND thumbnail_url IS NULL;
END $$;

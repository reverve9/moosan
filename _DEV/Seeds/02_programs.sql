-- ============================================
-- Festivals + Programs 시드 데이터
-- 01_schema.sql 실행 후 실행
-- ============================================

-- ────────────────────────────────────────────
-- Festivals (3개 메인 페이지)
-- ────────────────────────────────────────────
INSERT INTO festivals (slug, name, subtitle, description_lead, description_body, poster_url, schedule, venue, theme_color, sort_order)
VALUES
  (
    'musan',
    '설악무산문화축전',
    'Seorak Musan Cultural Festival',
    '설악무산문화축전은 설악산을 배경으로 펼쳐지는 종합 문화축전입니다. 자연과 예술, 사람이 어우러져 강원특별자치도의 정체성을 빛내는 대표 축제로 자리매김하고 있습니다.',
    '지역 예술인과 시민이 함께 만드는 무대, 전시, 체험 프로그램을 통해 설악의 가치를 새롭게 조명하고, 문화적 소통의 장을 마련하고자 합니다.',
    'festivals/musan/poster.png',
    '2026년 5월 15일(금) - 17일(일)',
    '속초 엑스포잔디공장 일원',
    '#E1F0DC',
    1
  ),
  (
    'food',
    '제3회 설악음식문화 페스티벌',
    'Seorak Food Culture Festival',
    '설악음식문화 페스티벌은 강원특별자치도의 향토 음식과 식문화를 소개하는 미식 축제입니다. 지역 식재료의 가치와 조리 전통을 한자리에서 만날 수 있습니다.',
    '지난 두 차례의 성공적인 개최를 바탕으로, 제3회 페스티벌은 더욱 다양한 셰프와 지역 농가가 참여하여 풍성한 미식 경험을 선사합니다.',
    'festivals/food/poster.png',
    '2026년 5월 15일(금) - 17일(일)',
    '속초 엑스포잔디공장 일원',
    '#FBE3D8',
    2
  ),
  (
    'youth',
    '제4회 설악청소년문화축전',
    'Seorak Youth Festival',
    '설악청소년문화축전은 설악무산문화축전의 한 행사로, 강원특별자치도는 물론 전국의 청소년들이 적극 참여하여 창의력을 발휘하고 협업과 체험을 통해 상생과 화합의 정신을 함양할 수 있는 청소년 문화축제입니다.',
    '지난 2023년 제1회 설악청소년문화축전을 성공적으로 개최한 경험을 바탕으로 제2회 축전을 확대 개편하여 개최함으로써, 청소년 문화를 선도하며 아울러 지역 경제·문화 발전에 기여하고자 합니다.',
    'festivals/youth/poster.png',
    '2026년 5월 15일(금) - 17일(일)',
    '속초 엑스포잔디공장 일원',
    '#FBF1CC',
    3
  )
ON CONFLICT (slug) DO NOTHING;

-- ────────────────────────────────────────────
-- Programs (청소년축전 하위 4개 프로그램)
-- 순서: saesaeng → choir → baekiljang → dance
-- ────────────────────────────────────────────

-- 1. 어린이 사생대회
INSERT INTO programs (
  festival_id, slug, name, category, target_divisions, participation_type, sort_order,
  description, event_name, schedule, venue, target_text, awards_text, registration_period, application_method,
  thumbnail_url
)
SELECT
  f.id,
  'saesaeng',
  '전국 어린이 사생대회',
  'art',
  ARRAY['미취학','초등 저학년','초등 고학년'],
  'individual',
  1,
  '전국 어린이 사생대회는 2025년도 제3회 설악청소년문화축전 행사의 하나로, 전국의 미취학아동 및 초등학생을 대상으로 열리는 문화예술 경연 행사입니다.',
  '2025 설악청소년문화축전 전국 어린이 사생대회',
  '2025년 5월 24일(토) 오후 1시 ~ 3시 30분',
  '속초시 청호호수공원 및 엑스포광장 일대',
  '대한민국 거주 미취학 아동 및 초등학생(어린이집, 유치원, 초등학교)',
  '강원특별자치도지사/도의회의장상, 속초시장상, 고성교육지원교육장상 등',
  '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
  '아래 ''접수하기''에 링크된 신청양식을 통해 접수',
  'programs/saesaeng/thumbnail.png'
FROM festivals f WHERE f.slug = 'youth'
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      description = EXCLUDED.description,
      event_name = EXCLUDED.event_name,
      schedule = EXCLUDED.schedule,
      venue = EXCLUDED.venue,
      target_text = EXCLUDED.target_text,
      awards_text = EXCLUDED.awards_text,
      registration_period = EXCLUDED.registration_period,
      application_method = EXCLUDED.application_method;

-- 2. 어린이 합창대회
INSERT INTO programs (
  festival_id, slug, name, category, target_divisions, participation_type, sort_order,
  description, event_name, schedule, venue, target_text, awards_text, registration_period, application_method,
  thumbnail_url
)
SELECT
  f.id,
  'choir',
  '전국 어린이 합창대회',
  'choir',
  ARRAY[]::TEXT[],
  'team',
  2,
  '2025 전국 어린이 합창대회는 제3회 설악청소년문화축전 행사의 하나로, 전국의 어린이합창단을 속초로 초청, 경연하여 지역 문화 발전에 기여하는 행사입니다.',
  '2025 설악청소년문화축전 전국 어린이 합창대회',
  '2025년 5월 23일(금) 오후 5시 ~ 7시 30분',
  '속초시 청호호수공원 엑스포광장 특설무대',
  E'미취학 아동 및 초등학교에 재학 중인 어린이\n최소 8명 ~ 최대 50명 이내로 구성된 합창단',
  '강원특별자치도지사상, 속초시장상 등',
  '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
  '아래 ''접수하기''에 링크된 신청양식을 통해 접수',
  'programs/choir/thumbnail.png'
FROM festivals f WHERE f.slug = 'youth'
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      description = EXCLUDED.description,
      event_name = EXCLUDED.event_name,
      schedule = EXCLUDED.schedule,
      venue = EXCLUDED.venue,
      target_text = EXCLUDED.target_text,
      awards_text = EXCLUDED.awards_text,
      registration_period = EXCLUDED.registration_period,
      application_method = EXCLUDED.application_method;

-- 3. 청소년 백일장
INSERT INTO programs (
  festival_id, slug, name, category, target_divisions, participation_type, sort_order,
  description, event_name, schedule, venue, target_text, awards_text, registration_period, application_method,
  thumbnail_url
)
SELECT
  f.id,
  'baekiljang',
  '전국 청소년 백일장',
  'writing',
  ARRAY['중등부','고등부'],
  'individual',
  3,
  '전국 청소년 백일장은 2025 설악청소년문화축전 행사의 하나로, 전국의 중·고등학생을 대상으로 운문과 산문 두 부문에 걸쳐 열리는 문화예술행사입니다.',
  '2025 설악청소년문화축전 전국 청소년 백일장',
  '2025년 5월 24일(토) 오후 2시 ~ 4시 30분',
  '속초시 청호호수공원 및 엑스포광장 일대',
  '대한민국 거주 중·고등학생 혹은 해당 연령 개인',
  '강원특별자치도지사상, 도의회의장상, 속초양양/고성 교육지원청교육장상 등',
  '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
  '아래 ''접수하기''에 링크된 신청양식을 통해 접수',
  'programs/baekiljang/thumbnail.png'
FROM festivals f WHERE f.slug = 'youth'
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      description = EXCLUDED.description,
      event_name = EXCLUDED.event_name,
      schedule = EXCLUDED.schedule,
      venue = EXCLUDED.venue,
      target_text = EXCLUDED.target_text,
      awards_text = EXCLUDED.awards_text,
      registration_period = EXCLUDED.registration_period,
      application_method = EXCLUDED.application_method;

-- 4. 청소년 스트리트댄스 페스티벌
INSERT INTO programs (
  festival_id, slug, name, category, target_divisions, participation_type, sort_order,
  description, event_name, schedule, venue, target_text, awards_text, registration_period, application_method,
  thumbnail_url
)
SELECT
  f.id,
  'dance',
  '전국 청소년 스트리트댄스 페스티벌',
  'dance',
  ARRAY['초등부','중등부','고등부'],
  'both',
  4,
  '전국 청소년 스트리트댄스 페스티벌은 2025 설악청소년문화축전의 메인이벤트로서, 전국의 청소년 댄서나 댄스팀의 경연을 통해 문화 체험의 기회를 확대하고 지역 문화 발전에 기여하고자 합니다.',
  '2025 전국 청소년 스트리트댄스 페스티벌',
  '2025년 5월 25일(일) 오후 5시 ~ 7시',
  '속초시 청호호수공원 엑스포광장 특설무대',
  '중·고등학생 최소 2명 ~ 최대 20명 이하로 구성된 동아리, 팀',
  '강원특별자치도의회의장상, 속초시장상 등',
  '2025년 3월 14일(금)~5월 2일(금) 18:00까지',
  '아래 ''접수하기''에 링크된 신청양식을 통해 접수',
  'programs/dance/thumbnail.png'
FROM festivals f WHERE f.slug = 'youth'
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      description = EXCLUDED.description,
      event_name = EXCLUDED.event_name,
      schedule = EXCLUDED.schedule,
      venue = EXCLUDED.venue,
      target_text = EXCLUDED.target_text,
      awards_text = EXCLUDED.awards_text,
      registration_period = EXCLUDED.registration_period,
      application_method = EXCLUDED.application_method;

-- ============================================================================
-- 20_seed_surveys_dummy.sql
-- 만족도 조사 더미 데이터 5건 — 어드민 통계 탭 테스트용
-- ============================================================================
--
-- 사용법
--   supabase db push 로 자동 반영되지 않도록 _DEV/Seeds 에 위치.
--   SQL Editor 에서 직접 실행 또는 psql 로 일회성 주입.
--   전화번호는 010-0000-0001 ~ 0005 로 모두 dev 용 더미.
-- ============================================================================

INSERT INTO surveys (
  festival_id, gender, age, region, name, phone, privacy_consented, answers
) VALUES

-- ───── 응답 1: 40대 남성, 경기, 불교, 매우 만족 ─────
(
  NULL, 'male', 42, 'gyeonggi', '테스트1', '010-0000-0001', true,
  '{
    "q1": "buddhism",
    "q1_1": "school_age",
    "q1_2": "1_month",
    "q2": "3",
    "q3": "4",
    "q3_1": "",
    "q4": "yes",
    "q5": "self",
    "q6": ["sns", "word_of_mouth"],
    "q7": "culture_experience",
    "q8": {
      "ordinary_attractive": 6,
      "unpleasant_pleasant": 7,
      "uncomfortable_comfortable": 6,
      "boring_interesting": 7
    },
    "q9": {"1": 6, "2": 6, "3": 7},
    "q10": {"1": 7, "2": 6, "3": 7},
    "q11": 7,
    "q11_1": null,
    "q11_2": "전통 공연이 기대 이상으로 감동적이었고, 행사 진행도 매끄러웠습니다.",
    "q12": "4",
    "q13": "5",
    "q14": "4",
    "q15": "3",
    "q16": "4",
    "q17": {"1": 7, "2": 6, "3": 7},
    "q18": {"1": 6, "2": 6, "3": 7},
    "q19": ["experience", "performance", "lecture"],
    "q20": "다음에는 체험 부스가 더 많았으면 좋겠습니다."
  }'::jsonb
),

-- ───── 응답 2: 30대 여성, 강원, 무교, 보통 ─────
(
  NULL, 'female', 35, 'gangwon', '테스트2', '010-0000-0002', true,
  '{
    "q1": "none",
    "q1_1": null,
    "q1_2": null,
    "q2": "1",
    "q3": "2",
    "q3_1": "",
    "q4": "no",
    "q5": "companion",
    "q6": ["outdoor", "government"],
    "q7": "local_food",
    "q8": {
      "ordinary_attractive": 5,
      "unpleasant_pleasant": 5,
      "uncomfortable_comfortable": 4,
      "boring_interesting": 4
    },
    "q9": {"1": 5, "2": 4, "3": 5},
    "q10": {"1": 5, "2": 5, "3": 4},
    "q11": 4,
    "q11_1": "야외 좌석이 부족해서 오래 서 있어야 했습니다.",
    "q11_2": null,
    "q12": "3",
    "q13": "3",
    "q14": "3",
    "q15": "2",
    "q16": "3",
    "q17": {"1": 4, "2": 5, "3": 4},
    "q18": {"1": 5, "2": 5, "3": 5},
    "q19": ["field_trip", "performance"],
    "q20": "주차 공간을 더 넓혀주세요."
  }'::jsonb
),

-- ───── 응답 3: 20대 여성, 서울, 개신교, 매우 만족 ─────
(
  NULL, 'female', 26, 'seoul', '테스트3', '010-0000-0003', true,
  '{
    "q1": "protestant",
    "q1_1": "before_elementary",
    "q1_2": "weekly",
    "q2": "2",
    "q3": "3",
    "q3_1": "",
    "q4": "yes",
    "q5": "self",
    "q6": ["sns", "religion_site"],
    "q7": "performance",
    "q8": {
      "ordinary_attractive": 7,
      "unpleasant_pleasant": 7,
      "uncomfortable_comfortable": 7,
      "boring_interesting": 7
    },
    "q9": {"1": 7, "2": 7, "3": 7},
    "q10": {"1": 7, "2": 7, "3": 6},
    "q11": 7,
    "q11_1": null,
    "q11_2": "친구와 함께 즐거운 시간을 보냈습니다. 분위기가 정말 좋았어요.",
    "q12": "5",
    "q13": "5",
    "q14": "4",
    "q15": "4",
    "q16": "5",
    "q17": {"1": 7, "2": 7, "3": 7},
    "q18": {"1": 7, "2": 7, "3": 7},
    "q19": ["networking", "discussion", "qna"],
    "q20": ""
  }'::jsonb
),

-- ───── 응답 4: 50대 남성, 강원, 불교, 보통 이상 ─────
(
  NULL, 'male', 55, 'gangwon', '테스트4', '010-0000-0004', true,
  '{
    "q1": "buddhism",
    "q1_1": "twenties",
    "q1_2": "weekly",
    "q2": "5",
    "q3": "4",
    "q3_1": "",
    "q4": "yes",
    "q5": "acquaintance",
    "q6": ["tv_radio", "newspaper", "word_of_mouth"],
    "q7": "family_booth",
    "q8": {
      "ordinary_attractive": 6,
      "unpleasant_pleasant": 6,
      "uncomfortable_comfortable": 5,
      "boring_interesting": 5
    },
    "q9": {"1": 6, "2": 5, "3": 6},
    "q10": {"1": 6, "2": 5, "3": 6},
    "q11": 5,
    "q11_1": null,
    "q11_2": "의미 있는 시간이었습니다. 내용 구성이 좋았습니다.",
    "q12": "4",
    "q13": "4",
    "q14": "3",
    "q15": "3",
    "q16": "4",
    "q17": {"1": 6, "2": 5, "3": 6},
    "q18": {"1": 6, "2": 6, "3": 5},
    "q19": ["lecture", "experience"],
    "q20": "노약자용 휴게 공간이 더 있으면 좋겠습니다."
  }'::jsonb
),

-- ───── 응답 5: 60대 여성, 강원, 천주교, 만족 ─────
(
  NULL, 'female', 63, 'gangwon', '테스트5', '010-0000-0005', true,
  '{
    "q1": "catholic",
    "q1_1": "school_age",
    "q1_2": "weekly",
    "q2": "4",
    "q3": "3",
    "q3_1": "",
    "q4": "no",
    "q5": "self",
    "q6": ["government", "outdoor"],
    "q7": "culture_experience",
    "q8": {
      "ordinary_attractive": 7,
      "unpleasant_pleasant": 6,
      "uncomfortable_comfortable": 6,
      "boring_interesting": 6
    },
    "q9": {"1": 6, "2": 7, "3": 7},
    "q10": {"1": 7, "2": 7, "3": 7},
    "q11": 6,
    "q11_1": null,
    "q11_2": "행사 기획이 매우 세심했고 봉사자분들이 친절하셨습니다.",
    "q12": "4",
    "q13": "5",
    "q14": "4",
    "q15": "3",
    "q16": "4",
    "q17": {"1": 7, "2": 6, "3": 7},
    "q18": {"1": 7, "2": 7, "3": 6},
    "q19": ["performance", "experience", "field_trip"],
    "q20": "안내 표지판 글자가 더 크면 좋겠습니다."
  }'::jsonb
);

-- 확인
SELECT
  id,
  gender,
  age,
  region,
  (answers->>'q11')::int AS q11_satisfaction,
  created_at
FROM surveys
ORDER BY created_at DESC
LIMIT 5;

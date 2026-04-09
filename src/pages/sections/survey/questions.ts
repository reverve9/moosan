/**
 * 만족도 조사 질문 상수.
 * 주관기관 확정 네이버 폼(_DEV/Screenshots/네이버 폼 01~09.png)과 1:1 대응.
 * 수정 금지 — 항목 변경은 반드시 주관기관 승인 후.
 */

// ─────────────────────────────────────────────────────────────────
// 기본 정보
// ─────────────────────────────────────────────────────────────────

export const GENDER_OPTIONS = [
  { value: 'male', label: '남자' },
  { value: 'female', label: '여자' },
]

/** 시·도 17개 (광역자치단체) */
export const REGION_OPTIONS = [
  { value: 'seoul', label: '서울특별시' },
  { value: 'busan', label: '부산광역시' },
  { value: 'daegu', label: '대구광역시' },
  { value: 'incheon', label: '인천광역시' },
  { value: 'gwangju', label: '광주광역시' },
  { value: 'daejeon', label: '대전광역시' },
  { value: 'ulsan', label: '울산광역시' },
  { value: 'sejong', label: '세종특별자치시' },
  { value: 'gyeonggi', label: '경기도' },
  { value: 'gangwon', label: '강원특별자치도' },
  { value: 'chungbuk', label: '충청북도' },
  { value: 'chungnam', label: '충청남도' },
  { value: 'jeonbuk', label: '전북특별자치도' },
  { value: 'jeonnam', label: '전라남도' },
  { value: 'gyeongbuk', label: '경상북도' },
  { value: 'gyeongnam', label: '경상남도' },
  { value: 'jeju', label: '제주특별자치도' },
]

// ─────────────────────────────────────────────────────────────────
// Q1 / Q2: 종교
// ─────────────────────────────────────────────────────────────────

export const RELIGION_OPTIONS = [
  { value: 'protestant', label: '개신교' },
  { value: 'buddhism', label: '불교' },
  { value: 'catholic', label: '천주교' },
  { value: 'confucianism', label: '유교' },
  { value: 'other', label: '다른 종교' },
  { value: 'none', label: '종교가 없다' },
]

/** Q1-1. 언제부터 */
export const RELIGION_SINCE_OPTIONS = [
  { value: 'before_elementary', label: '초등학교 입학 전' },
  { value: 'school_age', label: '초/중/고등학생 시절' },
  { value: 'twenties', label: '20대' },
  { value: 'thirties', label: '30대' },
  { value: 'forties', label: '40대' },
  { value: 'fifties_plus', label: '50세 이후' },
  { value: 'unknown', label: '잘 모르겠다' },
]

/** Q1-2. 종교활동 빈도 */
export const RELIGION_FREQUENCY_OPTIONS = [
  { value: 'weekly', label: '매주' },
  { value: '2_3_month', label: '한 달에 2~3회' },
  { value: '1_month', label: '한 달에 1회' },
  { value: '1_2_year', label: '일 년에 1~2회' },
  { value: 'rarely', label: '몇 년에 1회' },
  { value: 'never', label: '참여하지 않는다' },
  { value: 'unknown', label: '잘 모르겠다' },
]

/** Q3 / Q3-1: 4점 척도 영향력 */
export const INFLUENCE_OPTIONS = [
  { value: '4', label: '매우 영향을 준다' },
  { value: '3', label: '영향을 주는 편이다' },
  { value: '2', label: '별로 영향을 주지 않는 편이다' },
  { value: '1', label: '전혀 영향을 주지 않는다' },
]

// ─────────────────────────────────────────────────────────────────
// Q4~Q7: 행사 참여 경험
// ─────────────────────────────────────────────────────────────────

export const YES_NO_OPTIONS = [
  { value: 'yes', label: '예' },
  { value: 'no', label: '아니오' },
]

/** Q5. 참여 결정자 */
export const DECISION_MAKER_OPTIONS = [
  { value: 'self', label: '응답자 본인' },
  { value: 'companion', label: '동반자(일행)' },
  { value: 'acquaintance', label: '참여하지 않은 지인' },
  { value: 'other', label: '기타' },
]

/** Q6. 정보 출처 (복수선택) */
export const INFO_SOURCE_OPTIONS = [
  { value: 'religion_site', label: '종교 관련 홈페이지' },
  { value: 'tv_radio', label: 'TV, 라디오 등 방송' },
  { value: 'sns', label: '포털사이트, 블로그, SNS 등' },
  { value: 'newspaper', label: '신문/잡지/온·오프 기사, 광고 포함' },
  { value: 'government', label: '정부/지자체 홍보자료' },
  { value: 'outdoor', label: '옥외홍보물(현수막, 포스터 등)' },
  { value: 'word_of_mouth', label: '주변 사람' },
  { value: 'other', label: '기타' },
]

/** Q7. 기대한 부분 */
export const EXPECTATION_OPTIONS = [
  { value: 'culture_experience', label: '불교, 전통문화를 체험할 수 있는 기회' },
  { value: 'performance', label: '다채로운 공연이나 퍼포먼스 관람' },
  { value: 'local_food', label: '지역 역사와 특산물 맛보기' },
  { value: 'family_booth', label: '아이들과 함께 즐길 수 있는 체험 부스' },
  { value: 'gift_event', label: '기념품이나 경품 이벤트 참여' },
  { value: 'other', label: '기타' },
]

// ─────────────────────────────────────────────────────────────────
// Q8: 행사 이미지 (라이커트 4문항, 양끝 라벨)
// ─────────────────────────────────────────────────────────────────

export const IMAGE_ITEMS: { key: string; left: string; right: string }[] = [
  { key: 'ordinary_attractive', left: '평범한', right: '매력적' },
  { key: 'unpleasant_pleasant', left: '불쾌한', right: '유쾌한' },
  { key: 'uncomfortable_comfortable', left: '불편한', right: '편안한' },
  { key: 'boring_interesting', left: '지루한', right: '흥미있는' },
]

// ─────────────────────────────────────────────────────────────────
// Q9 / Q10 / Q17 / Q18: 라이커트 7점 하위 문항
// ─────────────────────────────────────────────────────────────────

export const Q9_ITEMS = [
  { key: '1', label: '1) 참여자의 특성과 눈높이에 맞는 구성으로 행사가 진행되었다' },
  { key: '2', label: '2) 참여자의 특성과 눈높이에 맞는 구성이 잘 진행되었다' },
  { key: '3', label: '3) 행사 취지가 참여자들에게 쉽게 전달되었다' },
]

export const Q10_ITEMS = [
  { key: '1', label: '1) 주관기관의 직원/행사관계자의 태도는 친절하고 만족스럽다' },
  { key: '2', label: '2) 주관기관의 행사 구성 및 준비에 대한 노력은 참여자 입장에서 공감되고 충분하다' },
  { key: '3', label: '3) 주관기관은 행사 취지 및 목적에 적합한 행사를 추진하고 있다' },
]

export const Q17_ITEMS = [
  { key: '1', label: '1) 같은 행사에 다시 참여할 의향이 있다' },
  { key: '2', label: '2) 비슷한 유형의 행사에 참여할 의향이 있다' },
  { key: '3', label: '3) 주변 사람들에게 추천할 의향이 있다' },
]

export const Q18_ITEMS = [
  { key: '1', label: '1) 본 행사는 종교의 이해 및 종교간 화합에 도움이 된다' },
  { key: '2', label: '2) 본 행사는 나눔문화, 생명 존중, 공동체 회복 등 종교의 사회적 역할에 도움이 된다' },
  { key: '3', label: '3) 본 행사는 정신적 위안 및 사회적 공감을 통해 건강한 사회 구현에 도움이 된다' },
]

// ─────────────────────────────────────────────────────────────────
// Q12~Q16: 5점 척도 운영 문항
// ─────────────────────────────────────────────────────────────────

export const APPROPRIATE_5_OPTIONS = [
  { value: '5', label: '매우 적절했다' },
  { value: '4', label: '적절했다' },
  { value: '3', label: '보통이다' },
  { value: '2', label: '부적절했다' },
  { value: '1', label: '매우 부적절했다' },
]

export const CONVENIENT_5_OPTIONS = [
  { value: '5', label: '매우 편리했다' },
  { value: '4', label: '편리했다' },
  { value: '3', label: '보통이다' },
  { value: '2', label: '불편했다' },
  { value: '1', label: '매우 불편했다' },
]

// ─────────────────────────────────────────────────────────────────
// Q19: 향후 희망 프로그램 (복수선택)
// ─────────────────────────────────────────────────────────────────

export const FUTURE_PROGRAM_OPTIONS = [
  { value: 'networking', label: '참가자 간 네트워킹 세션' },
  { value: 'lecture', label: '전문가 강연/세미나' },
  { value: 'experience', label: '체험형 활동' },
  { value: 'qna', label: '질의응답 시간 확대' },
  { value: 'discussion', label: '소그룹 토론' },
  { value: 'field_trip', label: '현장 투어/견학' },
  { value: 'performance', label: '공연/문화 프로그램' },
  { value: 'other', label: '기타' },
]

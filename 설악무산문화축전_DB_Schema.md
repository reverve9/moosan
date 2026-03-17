# 🗄️ DB Schema — 2026 설악무산문화축전
> Supabase (PostgreSQL)
> 작성일: 2026-03-17

---

## 테이블 목록

| 테이블 | 설명 |
|--------|------|
| `programs` | 프로그램 정보 |
| `applications` | 참가신청 (메인) |
| `participants` | 팀 구성원 명단 |
| `notices` | 공지사항 |

> 관리자 계정은 Supabase Auth 기본 사용 (별도 테이블 불필요)

---

## 1. programs

프로그램 기본 정보 및 설정. 어드민에서 관리.

```sql
CREATE TABLE programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,         -- 'baekiljang' | 'saesaeng' | 'dance' | 'choir'
  name            TEXT NOT NULL,                -- '백일장', '사생대회' 등
  category        TEXT NOT NULL,                -- 'writing' | 'art' | 'dance' | 'choir'
  target_divisions TEXT[] NOT NULL,             -- ['유치부','초등부'] or ['초등부','중등부','고등부']
  participation_type TEXT NOT NULL,             -- 'individual' | 'team' | 'both'
  min_team_size   INT,                          -- 팀 최소 인원 (팀 참가 시)
  max_team_size   INT,                          -- 팀 최대 인원 (팀 참가 시)
  description     TEXT,                         -- 프로그램 소개
  requirements    TEXT,                         -- 참가 자격 및 주의사항
  schedule        TEXT,                         -- 일정 (예: '5월 15일 오전 10시')
  venue           TEXT,                         -- 세부 장소
  awards          JSONB,                        -- 시상내역 (대상/금상/은상 등)
  registration_start TIMESTAMPTZ,               -- 접수 시작일
  registration_end   TIMESTAMPTZ,               -- 접수 마감일
  max_applicants  INT,                          -- 최대 접수 인원 (null = 무제한)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  meta            JSONB DEFAULT '{}',           -- 확장용
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**초기 데이터:**
```sql
INSERT INTO programs (slug, name, category, target_divisions, participation_type, sort_order) VALUES
  ('baekiljang', '백일장',       'writing', ARRAY['유치부','초등부'], 'individual', 1),
  ('saesaeng',   '사생대회',     'art',     ARRAY['유치부','초등부'], 'individual', 2),
  ('dance',      '댄스경연대회', 'dance',   ARRAY['초등부','중등부','고등부'], 'both', 3),
  ('choir',      '합창대회',     'choir',   ARRAY['초등부','중등부','고등부'], 'both', 4);
```

---

## 2. applications

참가신청 메인 테이블. 개인/팀 대표자 정보 저장.

```sql
CREATE TABLE applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 프로그램
  program_id          UUID NOT NULL REFERENCES programs(id),
  division            TEXT NOT NULL,   -- '유치부' | '초등부' | '중등부' | '고등부'
  participation_type  TEXT NOT NULL,   -- 'individual' | 'team'
  team_name           TEXT,            -- 팀명 (팀 참가 시)

  -- 신청자 / 팀 대표자 정보
  applicant_name      TEXT NOT NULL,
  applicant_birth     DATE,            -- 생년월일
  school_name         TEXT NOT NULL,
  school_grade        TEXT,            -- '1학년' 등
  phone               TEXT NOT NULL,
  email               TEXT,

  -- 보호자 정보 (유치부/초등부 필수)
  parent_name         TEXT,
  parent_phone        TEXT,
  parent_relation     TEXT,            -- '부' | '모' | '조부모' | '기타'

  -- 지도교사 정보
  teacher_name        TEXT,
  teacher_phone       TEXT,
  teacher_email       TEXT,
  teacher_subject     TEXT,            -- 담당 과목 / 지도 분야

  -- 관리
  status              TEXT NOT NULL DEFAULT 'pending',
                                       -- 'pending' | 'approved' | 'rejected' | 'cancelled' | 'waitlist'
  admin_memo          TEXT,            -- 관리자 메모
  rejection_reason    TEXT,            -- 반려 사유

  -- 개인정보 동의
  privacy_agreed      BOOLEAN NOT NULL DEFAULT false,
  privacy_agreed_at   TIMESTAMPTZ,

  -- 확장용
  meta                JSONB DEFAULT '{}',

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_applications_program_id ON applications(program_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_created_at ON applications(created_at);
CREATE INDEX idx_applications_division ON applications(division);
```

---

## 3. participants

팀 참가 시 팀원 명단. applications 1개에 N개.

```sql
CREATE TABLE participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  birth           DATE,
  school_name     TEXT,
  school_grade    TEXT,
  role            TEXT,               -- 역할/파트 (예: '보컬', '댄서' 등)
  is_leader       BOOLEAN DEFAULT false,  -- 팀장 여부
  sort_order      INT DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_participants_application_id ON participants(application_id);
```

> 개인 참가는 participants 테이블 미사용.
> 팀 대표자 정보는 applications에, 팀원 전체는 participants에 저장.

---

## 4. notices

공지사항. 어드민에서 CRUD.

```sql
CREATE TABLE notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,          -- HTML or Markdown
  category    TEXT DEFAULT 'general', -- 'general' | 'program' | 'result'
  is_pinned   BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notices_is_published ON notices(is_published);
CREATE INDEX idx_notices_is_pinned ON notices(is_pinned);
```

---

## 5. RLS (Row Level Security) 정책

```sql
-- applications: 누구나 INSERT, SELECT는 본인 것만, 관리자는 전체
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- 비로그인 사용자도 신청 가능
CREATE POLICY "누구나 신청 가능"
  ON applications FOR INSERT
  WITH CHECK (true);

-- 본인 신청 조회 (이메일 기준)
CREATE POLICY "본인 신청 조회"
  ON applications FOR SELECT
  USING (email = current_user OR auth.role() = 'authenticated');

-- participants: 신청과 동일 정책
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "누구나 팀원 등록 가능"
  ON participants FOR INSERT
  WITH CHECK (true);

-- programs: 누구나 읽기 가능
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "프로그램 공개 조회"
  ON programs FOR SELECT
  USING (is_active = true);

-- notices: 공개된 공지만 누구나 조회
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "공개 공지 조회"
  ON notices FOR SELECT
  USING (is_published = true);
```

> ⚠️ 어드민은 Supabase Dashboard에서 Service Role Key로 접근하거나,
> 별도 어드민 앱에서 authenticated role로 모든 RLS 우회

---

## 6. updated_at 자동 갱신 트리거

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_notices_updated_at
  BEFORE UPDATE ON notices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 7. 테이블 관계도

```
programs (1)
    └──< applications (N)
              └──< participants (N)

notices (독립)
```

---

## 8. 주요 필드 enum 정리

```
division:
  유치부 | 초등부 | 중등부 | 고등부

participation_type:
  individual | team

status:
  pending    → 신청 완료 (검토 전)
  approved   → 승인
  rejected   → 반려
  cancelled  → 취소 (신청자 취소)
  waitlist   → 대기 (정원 초과 시)

programs.category:
  writing | art | dance | choir

notices.category:
  general | program | result
```

---

## 9. 미결 사항

| 항목 | 내용 |
|------|------|
| 접수 마감일 | 프로그램 세부정보 수령 후 registration_end 업데이트 |
| 최대 인원 | 프로그램별 max_applicants 확정 필요 |
| 팀 인원 범위 | 댄스/합창 min/max_team_size 확정 필요 |
| 결과 발표 | 심사 결과 관리 기능 필요 여부 확인 |
| 파일 첨부 | 사생대회 작품 사진 제출 필요 여부 확인 |

---

## 10. Claude Code 전달용 스키마 프롬프트

```
Supabase 프로젝트에 다음 SQL을 순서대로 실행해줘:
1. programs 테이블 생성 + 초기 데이터 INSERT
2. applications 테이블 생성 + 인덱스
3. participants 테이블 생성 + 인덱스
4. notices 테이블 생성 + 인덱스
5. RLS 정책 적용
6. updated_at 트리거 적용

기술 스택: React + Vite + Supabase JS SDK v2
supabase-js 클라이언트는 src/lib/supabase.ts 에 싱글톤으로 생성.
환경변수: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

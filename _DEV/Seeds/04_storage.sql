-- ============================================
-- Supabase Storage — festival-assets 버킷 + RLS 정책
-- 03_test_applications.sql 실행 후 실행
--
-- 폴더 구조 컨벤션:
--   festivals/<slug>/poster.png        ← 메인 페이지 좌측 포스터
--   programs/<slug>/thumbnail.png      ← 아코디언 카드 썸네일
--   programs/<slug>/gallery/01.jpg     ← 작년 행사 사진
-- ============================================

-- ────────────────────────────────────────────
-- 버킷 생성 (public read)
-- ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'festival-assets',
  'festival-assets',
  true,
  10485760,  -- 10MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ────────────────────────────────────────────
-- RLS 정책: 누구나 읽기 (공개 이미지)
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "festival_assets_select" ON storage.objects;
CREATE POLICY "festival_assets_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'festival-assets');

-- ────────────────────────────────────────────
-- RLS 정책: 임시 — 누구나 업/수정/삭제 가능
-- 추후 Auth 연동 시 admin role만 허용하도록 변경:
--   USING (bucket_id = 'festival-assets' AND auth.role() = 'authenticated')
-- ────────────────────────────────────────────
DROP POLICY IF EXISTS "festival_assets_insert" ON storage.objects;
CREATE POLICY "festival_assets_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'festival-assets');

DROP POLICY IF EXISTS "festival_assets_update" ON storage.objects;
CREATE POLICY "festival_assets_update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'festival-assets');

DROP POLICY IF EXISTS "festival_assets_delete" ON storage.objects;
CREATE POLICY "festival_assets_delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'festival-assets');

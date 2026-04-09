import { supabase } from './supabase'
import type { Notice } from '@/types/database'

const STORAGE_BUCKET = 'festival-assets'
const STORAGE_PREFIX = 'notices'

export type NoticeCategory = 'general' | 'program' | 'result'

export interface NoticeInput {
  title: string
  content: string
  /** 업로드된 이미지 public URL 배열 — 순서 유지, 본문 위에 렌더 */
  images: string[]
  category: NoticeCategory
  is_pinned: boolean
  is_published: boolean
}

/**
 * 어드민용 — 전체 공지 조회 (미발행 포함).
 * 고정글 먼저, 그 다음 최신순.
 */
export async function fetchAllNotices(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * 손님용 — 발행된 공지 페이징 조회.
 * 고정글 먼저, 그 다음 published_at 최신순.
 */
export async function fetchPublishedNotices(
  offset: number,
  limit: number,
): Promise<{ rows: Notice[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .eq('is_published', true)
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit)
  if (error) throw error
  const rows = data ?? []
  const hasMore = rows.length > limit
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore }
}

/**
 * 손님용 — 단건 조회 (발행된 것만).
 */
export async function fetchPublishedNoticeById(id: string): Promise<Notice | null> {
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .eq('id', id)
    .eq('is_published', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createNotice(input: NoticeInput): Promise<Notice> {
  const payload = {
    ...input,
    published_at: input.is_published ? new Date().toISOString() : null,
  }
  const { data, error } = await supabase
    .from('notices')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateNotice(
  id: string,
  input: NoticeInput,
  prev: Pick<Notice, 'is_published' | 'published_at'>,
): Promise<Notice> {
  // published_at: false→true 일 때만 새로 찍음. 이미 발행된 상태라면 기존값 유지.
  let publishedAt = prev.published_at
  if (input.is_published && !prev.is_published) {
    publishedAt = new Date().toISOString()
  } else if (!input.is_published) {
    publishedAt = null
  }
  const { data, error } = await supabase
    .from('notices')
    .update({ ...input, published_at: publishedAt })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteNotice(id: string): Promise<void> {
  const { error } = await supabase.from('notices').delete().eq('id', id)
  if (error) throw error
}

/**
 * 공지에 첨부할 이미지를 Supabase Storage 에 업로드.
 * 반환값 = 공개 URL. `NoticeInput.images` 배열에 그대로 push.
 */
export async function uploadNoticeImage(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const stamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const path = `${STORAGE_PREFIX}/${stamp}_${random}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false, cacheControl: '3600' })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

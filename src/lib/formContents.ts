import { supabase } from './supabase'

export type FormContentMap = Record<string, string>

/** program_id 기준으로 form_contents 전체 조회 → { field_key: content } */
export async function fetchFormContents(programId: string): Promise<FormContentMap> {
  const { data, error } = await supabase
    .from('form_contents')
    .select('field_key, content')
    .eq('program_id', programId)
  if (error) throw error
  const map: FormContentMap = {}
  for (const row of data ?? []) {
    map[row.field_key] = row.content
  }
  return map
}

/** 변경된 필드만 upsert (program_id + field_key unique) */
export async function upsertFormContents(
  programId: string,
  contents: FormContentMap,
): Promise<void> {
  const rows = Object.entries(contents).map(([field_key, content]) => ({
    program_id: programId,
    field_key,
    content,
  }))
  if (rows.length === 0) return
  const { error } = await supabase
    .from('form_contents')
    .upsert(rows, { onConflict: 'program_id,field_key' })
  if (error) throw error
}

/** program slug 기준으로 조회 (slug → program_id 변환 포함) */
export async function fetchFormContentsBySlug(slug: string): Promise<FormContentMap> {
  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (!program) return {}
  return fetchFormContents(program.id)
}

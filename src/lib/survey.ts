import { supabase } from './supabase'
import type { Json, Survey } from '@/types/database'

/**
 * 만족도 조사 제출 — 같은 phone + festival_id 조합은 DB unique 제약으로 차단.
 * 중복 제출 시 에러 메시지 한국어로 변환해서 throw.
 */

export interface SubmitSurveyInput {
  festivalId: string | null
  gender: 'male' | 'female'
  age: number
  region: string
  name: string
  phone: string
  privacyConsented: boolean
  answers: Record<string, unknown>
}

export async function submitSurvey(input: SubmitSurveyInput): Promise<Survey> {
  const { data, error } = await supabase
    .from('surveys')
    .insert({
      festival_id: input.festivalId,
      gender: input.gender,
      age: input.age,
      region: input.region,
      name: input.name,
      phone: input.phone,
      privacy_consented: input.privacyConsented,
      answers: input.answers as Json,
    })
    .select()
    .single()

  if (error) {
    // Postgres unique violation
    if (error.code === '23505') {
      throw new Error('이미 제출하신 연락처입니다. 설문은 한 번만 참여 가능합니다.')
    }
    throw new Error(error.message || '설문 제출에 실패했습니다.')
  }

  return data as Survey
}

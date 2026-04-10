import { useEffect, useState } from 'react'
import { fetchFormContentsBySlug, type FormContentMap } from '@/lib/formContents'

/** 하드코딩 기본값 — DB에 없을 때 fallback */
const DEFAULTS: FormContentMap = {
  notice:
    '본 신청서는 원활한 대회 운영을 위해 사용됩니다.\n정확한 정보가 기재될 수 있도록 지도교사 및 대표자께서는 내용을 확인 후 제출해주시기 바랍니다.\n\n잘못된 정보로 인해 발생하는 불이익은 주최 측에서 책임지지 않습니다.',
  rules:
    '본 참가자는 대회 일정 및 운영 방침을 준수합니다.\n참가 신청에 기재한 내용은 사실과 다를시 심사에서 제외되며, 위부 사항이 확인될 경우 참가가 취소될 수 있습니다.\n대회 당일 준비물 및 시간에 맞게 도착하여야 하며, 관련 운영 변경시 사전 안내는 참가자에게만 진행됩니다.\n대회 입장 리허설 및 본 공연 시간은 대회의 사정에 따라 변경 가능하며, 상세 내용은 문자발송이 진행됩니다.\n천재지변, 감염병, 기타 불가항력적 사유 발생 시 대회 일정 및 방식이 변경될 수 있습니다.\n대회 시 촬영된 사진 및 영상은 기록, 홍보, 보도 자료를 위해 비상업적 목적으로 활용됩니다.',
  privacy_items: '이름, 연락처, 주소, 생년월일, 통장사본 등',
  privacy_purpose:
    '대회 참가신청서 작성 시 참가팀이 제공한 자료 및 추후 자료 지급에 한하여 대회 운영을 목적으로 수집하며 이외의 목적으로 사용하지 않습니다.',
  privacy_retention: '저장 된 개인정보는 수집 및 이용목적이 달성되면 파기합니다.',
}

/**
 * 프로그램 slug 기준으로 form_contents 를 가져옴.
 * DB 에 값이 없으면 하드코딩 기본값 사용.
 */
export function useFormContents(slug: string) {
  const [contents, setContents] = useState<FormContentMap>(DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchFormContentsBySlug(slug)
      .then((data) => {
        if (cancelled) return
        // DB 값이 있으면 덮어쓰기, 없으면 기본값 유지
        setContents({ ...DEFAULTS, ...data })
      })
      .catch(() => {
        // 실패해도 기본값으로 동작
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [slug])

  return { contents, loading }
}

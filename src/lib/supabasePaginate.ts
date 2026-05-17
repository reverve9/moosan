/**
 * Supabase / PostgREST 의 max-rows (기본 1000) 자동 절단 회피용 페이지네이션.
 *
 * 호출부에 .range(from, to) 를 끼운 빌더 함수를 넘기면 1000건씩 반복 호출해
 * 전체 행을 모은다. 마지막 페이지가 PAGE 미만이면 종료.
 *
 * 사용 예:
 *   const all = await fetchAllPages<Payment>((from, to) =>
 *     supabase.from('payments').select().gte('created_at', x).range(from, to)
 *   )
 */
export const SUPABASE_PAGE_SIZE = 1000

export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await build(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) throw error as Error
    const arr = (data ?? []) as T[]
    if (arr.length === 0) break
    out.push(...arr)
    if (arr.length < SUPABASE_PAGE_SIZE) break
  }
  return out
}

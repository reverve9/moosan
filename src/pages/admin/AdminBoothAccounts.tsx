import { Key, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hashBoothPassword } from '@/lib/boothAuth'
import { importFromExcel } from '@/lib/excel'
import { ImportButton } from '@/components/admin/ExcelButtons'
import type { BoothAccount, FoodBooth } from '@/types/database'
import styles from './AdminBoothAccounts.module.css'

interface BoothRow {
  booth: FoodBooth
  account: BoothAccount | null
  loginInput: string
  passwordInput: string
}

export default function AdminBoothAccounts() {
  const [rows, setRows] = useState<BoothRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyBoothId, setBusyBoothId] = useState<string | null>(null)
  const [savedBoothId, setSavedBoothId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const [boothsRes, accountsRes] = await Promise.all([
      supabase
        .from('food_booths')
        .select()
        .eq('is_active', true)
        .order('booth_no', { ascending: true }),
      supabase.from('booth_accounts').select(),
    ])

    if (boothsRes.error) {
      setError(`부스 목록 조회 실패: ${boothsRes.error.message}`)
      return
    }
    if (accountsRes.error) {
      setError(`계정 목록 조회 실패: ${accountsRes.error.message}`)
      return
    }

    const accountByBooth = new Map(
      (accountsRes.data ?? []).map((a) => [a.booth_id, a]),
    )

    setRows(
      (boothsRes.data ?? []).map<BoothRow>((booth) => ({
        booth,
        account: accountByBooth.get(booth.id) ?? null,
        loginInput: accountByBooth.get(booth.id)?.login_id ?? '',
        passwordInput: '',
      })),
    )
    setError(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refetch().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refetch])

  const updateRow = (boothId: string, patch: Partial<BoothRow>) => {
    setRows((prev) => prev.map((r) => (r.booth.id === boothId ? { ...r, ...patch } : r)))
  }

  const flashSaved = (boothId: string) => {
    setSavedBoothId(boothId)
    window.setTimeout(() => {
      setSavedBoothId((cur) => (cur === boothId ? null : cur))
    }, 1500)
  }

  const handleCreate = async (row: BoothRow) => {
    if (busyBoothId) return
    const loginId = row.loginInput.trim()
    const password = row.passwordInput
    if (!loginId || !password) {
      setError('아이디와 비밀번호를 모두 입력하세요.')
      return
    }
    setBusyBoothId(row.booth.id)
    setError(null)
    try {
      const password_hash = await hashBoothPassword(password)
      const { error: insertErr } = await supabase.from('booth_accounts').insert({
        booth_id: row.booth.id,
        login_id: loginId,
        password_hash,
      })
      if (insertErr) throw new Error(insertErr.message)
      await refetch()
      flashSaved(row.booth.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '계정 생성 실패')
    } finally {
      setBusyBoothId(null)
    }
  }

  const handleUpdatePassword = async (row: BoothRow) => {
    if (!row.account || busyBoothId) return
    const password = row.passwordInput
    if (!password) {
      setError('새 비밀번호를 입력하세요.')
      return
    }
    setBusyBoothId(row.booth.id)
    setError(null)
    try {
      const password_hash = await hashBoothPassword(password)
      const { error: updateErr } = await supabase
        .from('booth_accounts')
        .update({ password_hash })
        .eq('id', row.account.id)
      if (updateErr) throw new Error(updateErr.message)
      updateRow(row.booth.id, { passwordInput: '' })
      flashSaved(row.booth.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호 변경 실패')
    } finally {
      setBusyBoothId(null)
    }
  }

  const handleDelete = async (row: BoothRow) => {
    if (!row.account || busyBoothId) return
    if (!window.confirm(`${row.booth.name} 매장 계정을 삭제하시겠습니까?`)) return
    setBusyBoothId(row.booth.id)
    setError(null)
    try {
      const { error: delErr } = await supabase
        .from('booth_accounts')
        .delete()
        .eq('id', row.account.id)
      if (delErr) throw new Error(delErr.message)
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '계정 삭제 실패')
    } finally {
      setBusyBoothId(null)
    }
  }

  const handleAccountImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const data = await importFromExcel(file)
      let created = 0
      for (const row of data) {
        const boothName = row['매장명']?.trim()
        const loginId = row['아이디']?.trim()
        const password = row['비밀번호']?.trim()
        if (!boothName || !loginId || !password) continue
        const match = rows.find((r) => r.booth.name === boothName)
        if (!match || match.account) continue
        const password_hash = await hashBoothPassword(password)
        await supabase.from('booth_accounts').insert({
          booth_id: match.booth.id,
          login_id: loginId,
          password_hash,
        })
        created++
      }
      alert(created > 0 ? `${created}개 계정 생성 완료` : '새로 생성할 계정이 없습니다')
      void refetch()
    } catch (err) {
      alert('파일 처리 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'))
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>매장 계정 관리</h1>
          <p className={styles.sub}>매장 직원이 /booth 로 로그인할 때 사용할 계정</p>
        </div>
        <ImportButton onFile={handleAccountImport} label="일괄 가져오기" />
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.placeholder}>매장 목록을 불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className={styles.placeholder}>등록된 매장이 없습니다.</div>
      ) : (
        <div className={styles.list}>
          {rows.map((row) => {
            const hasAccount = !!row.account
            const busy = busyBoothId === row.booth.id
            const saved = savedBoothId === row.booth.id
            return (
              <article key={row.booth.id} className={styles.row}>
                <div className={styles.boothCol}>
                  <div className={styles.boothName}>{row.booth.name}</div>
                  {row.booth.booth_no && (
                    <div className={styles.boothNo}>{row.booth.booth_no}번 매장</div>
                  )}
                </div>
                <div className={styles.formCol}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>아이디</label>
                    <input
                      className={styles.input}
                      type="text"
                      value={row.loginInput}
                      placeholder="login id"
                      readOnly={hasAccount}
                      onChange={(e) =>
                        updateRow(row.booth.id, { loginInput: e.target.value })
                      }
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      {hasAccount ? '새 비밀번호' : '비밀번호'}
                    </label>
                    <input
                      className={styles.input}
                      type="text"
                      value={row.passwordInput}
                      placeholder={hasAccount ? '변경 시 입력' : 'password'}
                      onChange={(e) =>
                        updateRow(row.booth.id, { passwordInput: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className={styles.actionCol}>
                  {hasAccount ? (
                    <>
                      <button
                        type="button"
                        className={styles.actionPrimary}
                        onClick={() => handleUpdatePassword(row)}
                        disabled={busy || !row.passwordInput}
                      >
                        <Key />
                        <span>{busy ? '처리 중' : 'PW 변경'}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.actionDanger}
                        onClick={() => handleDelete(row)}
                        disabled={busy}
                      >
                        <Trash2 />
                        <span>삭제</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.actionPrimary}
                      onClick={() => handleCreate(row)}
                      disabled={busy || !row.loginInput || !row.passwordInput}
                    >
                      <span>{busy ? '생성 중' : '계정 생성'}</span>
                    </button>
                  )}
                  {saved && <span className={styles.savedBadge}>저장됨</span>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

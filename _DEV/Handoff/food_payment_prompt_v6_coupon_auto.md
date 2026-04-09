# 쿠폰 자동 적용 — 전화번호 기반

> v6 쿠폰 조회 페이지 방식 대신 이 방식으로 대체
> 별도 조회 페이지 불필요

---

## 핵심 개념

체크아웃에서 전화번호 입력 시 해당 번호로 발급된 쿠폰을 자동으로 불러와 표시.
사용자가 코드를 기억하거나 입력할 필요 없음.

---

## 1. CheckoutPage 쿠폰 UX 변경

### 기존 흐름
```
전화번호 입력
쿠폰 코드 직접 입력 → 적용 버튼
```

### 변경 후 흐름
```
전화번호 입력
↓ (자동 조회)
사용 가능한 쿠폰 있으면 자동 표시

┌─────────────────────────────┐
│  🎟 사용 가능한 쿠폰         │
│  2,000원 할인                │
│  10,000원 이상 주문 시 적용  │
│  [적용하기]  [사용 안 함]    │
└─────────────────────────────┘
```

- 쿠폰 없으면 섹션 미표시
- 쿠폰 있으면 자동 노출 (코드 입력 불필요)
- [적용하기] → 할인 적용 + 결제 금액 업데이트
- [사용 안 함] → 섹션 닫기 (쿠폰 미적용으로 진행)
- 기존 코드 직접 입력 필드 제거

### 조회 시점
- 전화번호 입력 완료 시 (11자리 완성 순간) 자동 fetch
- 로딩 중 스피너 표시
- 조회 조건: `phone = 입력값 AND status = 'active' AND expires_at > now()`

---

## 2. lib 함수

`src/lib/coupons.ts` 에 함수 추가:

```typescript
export async function fetchAvailableCouponByPhone(
  phone: string
): Promise<CouponRow | null> {
  const { data } = await supabase
    .from('coupons')
    .select('*')
    .eq('phone', phone)  // coupons 테이블에 phone 컬럼 필요 — 아래 DB 변경 참고
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data ?? null;
}
```

---

## 3. DB 변경

### `coupons` 테이블에 `phone` 컬럼 추가

```sql
ALTER TABLE coupons
  ADD COLUMN phone TEXT;

-- 인덱스 추가 (전화번호 조회 성능)
CREATE INDEX idx_coupons_phone ON coupons(phone);
```

### 설문 쿠폰 발급 시 phone 저장

`src/lib/survey.ts` 쿠폰 생성 시:
```typescript
await createCouponManually({
  discount_amount: 2000,
  min_order_amount: 10000,
  expires_at: festivalEndDate,
  issued_source: 'survey',
  phone: submitterPhone,  // 설문 제출자 전화번호
  note: '만족도조사 참여 쿠폰'
});
```

### `src/types/database.ts` 업데이트
- `coupons` 테이블 Row/Insert/Update 에 `phone: string | null` 추가

---

## 4. 설문 완료 화면

쿠폰 코드 표시 방식 유지 (코드 복사 원하는 사람을 위해):

```
설문 참여 감사합니다 🎉

2,000원 할인 쿠폰이 발급되었습니다
결제 시 전화번호를 입력하면 자동으로 적용됩니다

[음식 주문하러 가기]
```

- 코드 직접 노출 불필요 (전화번호로 자동 적용되니까)
- 별도 복사 버튼 불필요

---

## 5. 제거되는 것

- `/coupon/lookup` 페이지 (v6 프롬프트) → 불필요, 만들지 않음
- 체크아웃 쿠폰 코드 직접 입력 필드 → 제거
- "쿠폰 코드를 잃어버리셨나요?" 링크 → 제거

---

## 6. 주의사항

- 전화번호 포맷 통일: 하이픈 제거 후 저장/조회 (`01012341234`)
- 수동 발급 쿠폰 (issued_source='manual') 은 phone 없음 → 코드 직접 입력 방식 유지 필요 여부 확인
- 빌드 검증은 `npm run build`

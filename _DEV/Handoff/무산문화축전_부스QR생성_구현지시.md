# 무산문화축전 — 부스별 QR 코드 생성 기능 추가

## 배경
각 부스 코너에 QR 코드를 배치해서 고객이 스캔하면
해당 부스 메뉴 페이지로 바로 이동할 수 있게 한다.

## 구현 범위

### 1. 어드민 QR 코드 페이지 추가
경로: `/admin/qrcodes`
파일: `src/pages/admin/AdminQRCodes.tsx`

- 전체 부스 목록 조회 (`food_booths` 테이블, `is_active=true`)
- 부스별 QR 코드 카드 표시 (부스명 + QR 이미지)
- QR 링크 형식: `${BASE_URL}/program/food?booth={boothId}`
- 라이브러리: `qrcode.react` 사용 (`npm install qrcode.react`)

### 2. 인쇄 최적화
- 브라우저 인쇄 시 A4 기준 한 페이지에 QR 카드 배치
- print CSS 적용:
  - 카드당 부스명 (크고 굵게) + QR 코드 (충분한 크기, 최소 200×200px)
  - 여백/여백 조정으로 잘림 방지
- "인쇄" 버튼 제공 (`window.print()`)

### 3. 어드민 네비게이션 추가
기존 어드민 메뉴에 "QR 코드" 항목 추가

## 주의사항
- DB 변경 없음
- 기존 로직 변경 없음
- 빌드/타입체크 통과 확인 후 완료

## 파일 구조 참고
- 기존 어드민 페이지 참고: `src/pages/admin/AdminOrders.tsx`
- 라우팅 파일에 `/admin/qrcodes` 경로 추가 필요

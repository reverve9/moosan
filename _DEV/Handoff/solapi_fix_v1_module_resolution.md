# 솔라피 알림톡 — fix v1: module resolution

## §0 문제

Vercel `musanfesta-dev` 함수 로그 (시각 2026-05-11 11:35:29~50 KST):
```
POST /api/booth-orders/ready  500
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/api/_lib/alimtalk' imported from ...
```

`api/booth-orders/ready.ts` 가 `api/_lib/alimtalk` 모듈을 import 하는데 Vercel runtime 에서 resolution 실패. 함수 핸들러 진입 자체가 throw.

A·B·C curl 호출 3건 모두 동일 에러. booth 정합성 체크 (B 의 403 기대) 단계 도달 못 함.

---

## §1 작업 범위

### 1-1. 진단

다음 항목 확인 후 보고:

1. **`api/booth-orders/ready.ts`, `api/_lib/alimtalk.ts`, `api/_lib/phone.ts`, `api/orders/cancel.ts`, `api/payments/cancel.ts` 의 import 문** — 다른 `api/` 내부 모듈 import 시:
   - 확장자 명시 여부 (`.js` 또는 `.ts` 또는 없음)
   - 상대 경로 형태 (`../_lib/alimtalk` vs `../_lib/alimtalk.js`)
   
2. **`package.json`** — `"type": "module"` 설정 여부

3. **`tsconfig.json`** — `module`, `moduleResolution`, `target` 설정

4. **`.vercelignore` / `vercel.json`** — `api/_lib/` 또는 underscore prefix 폴더가 build artifact 에서 제외되는 설정 있는지

5. **기존 작동 중인 다른 `api/*.ts` 의 import 패턴** — 예: `api/orders/cancel.ts` 가 다른 모듈을 어떻게 import 하는지 (기존 파일이 정답 기준)

### 1-2. 수정

위 진단 결과 기반으로 최소 수정. 가능 패턴:

- **A. import 경로에 `.js` 확장자 명시** (TypeScript ESM 표준):
  ```ts
  import { sendPickupAlimtalk } from '../_lib/alimtalk.js'
  import { normalizePhone } from './phone.js'
  ```
- **B. `tsconfig.json` 의 `moduleResolution` 또는 `module` 변경** — 기존 컨벤션과 일관성 유지하는 한도 내에서
- **C. `vercel.json` 의 `includeFiles` 등 build 설정**으로 `api/_lib/` 강제 포함

⚠️ **기존 `api/orders/cancel.ts`, `api/payments/cancel.ts` 등이 정상 작동했던 import 패턴이 정답 기준.** 그 패턴과 일관되도록 신규 파일 (`alimtalk.ts`, `phone.ts`, `booth-orders/ready.ts`) 수정.

만약 기존 파일도 같은 패턴인데 alimtalk 만 문제라면 — `api/_lib/` 폴더 자체가 Vercel build 에서 제외되는 게 원인일 수 있음 (예: `_` prefix 폴더 처리, gitignore 와의 충돌 등). 그 경우 C 옵션 또는 폴더 이름 변경 (`api/_lib/` → `api/lib/` 등).

### 1-3. 빌드 확인

`npm run build` clean pass.

---

## §2 금지

- ❌ 검증 행위 (curl 직접 실행, 시드 데이터 작성, DB 직접 조회) — 다음 턴 사용자 재검증
- ❌ 기존 컨벤션 깨는 새 패턴 도입
- ❌ alimtalk 코드 로직 변경 (이 턴은 module resolution 만)
- ❌ `api/_lib/alimtalk.ts` 의 함수 시그니처 / 동작 변경
- ❌ 마이그레이션 / DB / env 변경

---

## §3 착수 전 확정 사항

| 항목 | 값 |
|---|---|
| 작업 범위 | module resolution 만. 다른 로직 / API / DB 변경 X |
| 정답 기준 | 기존 `api/orders/cancel.ts` 등의 import 패턴과 일관성 |
| 보안 / 멱등성 / 발송 로직 | 기존 구현 그대로 유지 |

---

## §4 커밋

```
fix(api): _lib import 경로 module resolution
```

또는 진단 결과에 따라 적절한 prefix.

---

## §5 핸드오프 예상 출력

1. **진단 결과**:
   - import 패턴 (기존 vs 신규 비교)
   - package.json / tsconfig 관련 설정
   - .vercelignore / vercel.json 영향 여부
2. **원인** — 어떤 패턴이 문제였는지 (한 줄 결론)
3. **채택한 수정 방안** (A/B/C 또는 다른 것) + 이유
4. **수정 파일 목록 + diff**
5. **`npm run build` 결과** (clean pass)
6. **사용자 재검증 안내**:
   - 같은 curl A·B·C 재시도
   - 어떤 endpoint URL / 어떤 base URL

---

## §6 다음 블록

수정 보고 받은 후 사용자가 §2-2 curl 재실행 (A·B·C) → 결과 챗 보고 → 검증 진행

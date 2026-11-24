# 개발 로드맵 및 검증
| 단계 | 작업 | 완료 기준 |
|---|---|---|
| P0 | 원본 빌드 및 테스트 | pnpm install/test/build 실제 결과 기록 |
| P1 | 공통 스키마, 저장소, Coverage | idempotent merge, 상태/근거/버전 저장 |
| P2 | 데이터 CLI | 요청/조회/누락/검증/재개 |
| P3 | 수집기 | Binance archive, CCXT, PyKRX, Upbit, 이후 KIS/키움 |
| P4 | 검증 및 합성 | 휴장/정지/미체결/누락, 세션별 집계 |
| P5 | Data API | 기간 조회, 작업 상태, snapshot |
| P6 | Kandle DataSource | 종목/시간봉/구간 로딩 |
| P7 | Data Manager UI | 상태 지도, 진행률, 재수집, 내보내기 |
| P8 | Quick Backtest | 독립 기간, warm-up, 결과 재현 |
| P9 | Research Backtest | 대량 종목, Bar Magnifier, 최적화, walk-forward |
| P10 | Pattern Research | 유사 검색, 라벨, 누수 검증 |
```mermaid
flowchart LR
 P0[원본 검증] --> P1[Storage + Coverage]
 P1 --> P2[CLI + Collectors]
 P2 --> P3[Validation + Resample]
 P3 --> P4[API + Adapter]
 P4 --> P5[Data Manager]
 P5 --> P6[Backtest]
 P6 --> P7[Pattern Research]
```
## 테스트 필수
- 동일 요청 반복 시 중복 다운로드/저장 없음. 앞/중간/끝 누락만 요청.
- 휴장, 임시 세션, 상장 이전, 거래 정지, 실제 미체결, 공급원 오류, 빈 응답을 구분.
- API 페이지네이션 중단/중복, 재개, 재시도 제한, 동시 요청, 파일 게시 중 장애 복구.
- 캔들 OHLCV 이상, 정정, 공급원 충돌, 파일 손상, 캐시 무효화.
- UTC/KST 변환, 반열린 경계, 1m→5m/15m 세션별 집계, 미완성 봉.
- Strict 실행 차단, synthetic 체결 금지, 미래 참조 차단, warm-up 무주문.
- 다음 봉 체결, 동일 봉 SL/TP 모호성, 비용/호가, 결과 재현, UI 확대와 백테스트 기간 독립.
- CPU/RAM/SSD 벤치마크: 실제 데이터로 1종목/100종목, 수집/조회/백테스트 시간 및 peak RAM 기록.
## 개발 환경
Windows/Linux, Node/pnpm(원본 package.json 요구 버전 확인), Python 가상환경. 원본 설치 후 pnpm test 및 pnpm build. 로컬 데이터 경로 외부 설정. API 키는 환경변수/비밀 저장소. 공개 데이터라도 재배포 권한 확인.
## 상태
이 커밋은 설계 기록이다. 실제 구현 및 빌드/테스트 검증은 이후 단계이며, 원본 Kandle 기능에 대한 이전 조사 결과는 확인 필요 항목으로 관리한다.

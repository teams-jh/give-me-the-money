# 📈 미국 상장 탑 100 기업 주가 추세 분석기

yfinance를 활용해 미국 상장 탑 100 기업의 3년 월봉 데이터를 수집하고,
선형회귀 기반 알고리즘으로 주가 추세를 자동 분류하는 도구입니다.

## 추세 분류 기준

| 구분 | 기호 | 조건 |
|------|------|------|
| 강세장 (Bullish)   | 🟢 | 3년 누적 +30% 이상 또는 뚜렷한 상승 기울기 |
| 횡보장 (Sideways)  | 🟡 | 3년 기준 -15% ~ +30% 사이, 방향성 약함 |
| 하락장 (Bearish)   | 🔴 | 3년 누적 -15% 이하, 최근 6개월도 부진 |
| 반등 중 (Recovering)| 🔵 | 전체 수익 낮으나 최근 6개월 +15%, 1년 +20% 이상 |

## 설치

```bash
pip install -r requirements.txt
```

## 사용법

```bash
# 데이터 수집 + 리포트 생성 (약 5분 소요)
python run.py

# 기존 stock_data.json 재사용 (리포트만 재생성)
python run.py --no-fetch
```

생성 파일:
- `stock_data.json` — 수집된 원시 데이터
- `output/us_stock_trend_analysis.html` — 인터랙티브 대시보드

## 대시보드 기능

- **카테고리 필터** — 상단 카드 클릭으로 강세/횡보/하락/반등 종목 필터링
- **섹터 필터** — Technology, Healthcare 등 11개 섹터별 보기
- **수익률 정렬** — 3년/6개월 수익률 기준 정렬
- **종목 검색** — 티커 또는 회사명 검색
- **상세 차트** — 카드 클릭 시 3년 정규화 차트 팝업

## 프로젝트 구조

```
us-stock-analyzer/
├── analyze_stocks.py   # yfinance 데이터 수집 + 추세 분류
├── build_report.py     # stock_data.json → HTML 리포트 변환
├── run.py              # 원클릭 실행 진입점
├── requirements.txt
└── output/             # 생성된 HTML 저장 디렉토리
```

## 분류 알고리즘

```python
# 반등: 전체 수익 낮지만 최근 회복
if total_return < 15 and return_6m >= 15 and return_1y >= 20:
    trend = "recovering"
# 하락: 3년 -15% 이하, 최근도 부진
elif total_return <= -15 and return_6m < 10:
    trend = "bearish"
# 강세: 3년 +30% 초과 또는 기울기 강하고 수익 양호
elif total_return >= 30 or (slope_pct >= 0.5 and total_return >= 15):
    trend = "bullish"
# 나머지: 횡보
else:
    trend = "sideways"
```

## 주의사항

> ⚠️ 본 도구는 분석 목적으로 제작되었으며 투자 권고가 아닙니다.  
> 실제 투자 결정은 공인된 금융 전문가와 상담하세요.

## 라이선스

MIT

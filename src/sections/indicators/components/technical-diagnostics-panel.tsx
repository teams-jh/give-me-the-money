'use client';

import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { DiagnosticCard } from './diagnostic-card';

export interface TechAnalysisData {
  currentPrice: number;
  latestSma20: number;
  latestSma50: number;
  latestRsi: number;
  latestHist: number;
  latestMacd: number;
  latestSignal: number;
  latestBbUpper: number;
  latestBbLower: number;
  latestBbSma: number;
  latestEnvUpper: number;
  latestEnvLower: number;
  fibonacci: {
    fib382: number;
    [key: string]: any;
  };
  latestDonchianUpper: number;
  latestSupport?: number;
  latestResistance?: number;
}

interface TechnicalDiagnosticsPanelProps {
  showSma5: boolean;
  showSma20: boolean;
  showSma60: boolean;
  showSma120: boolean;
  showSma240: boolean;
  showBb: boolean;
  showRsi: boolean;
  showMacd: boolean;
  showEnv: boolean;
  showFib: boolean;
  showDonchian: boolean;
  showAutoTrend: boolean;
  techAnalysis: TechAnalysisData;
  formatMoney: (val: number) => string;
}

export function TechnicalDiagnosticsPanel({
  showSma5,
  showSma20,
  showSma60,
  showSma120,
  showSma240,
  showBb,
  showRsi,
  showMacd,
  showEnv,
  showFib,
  showDonchian,
  showAutoTrend,
  techAnalysis,
  formatMoney,
}: TechnicalDiagnosticsPanelProps) {
  const theme = useTheme();

  const getRsiDiagnostic = (val: number) => {
    if (val >= 70) {
      return {
        status: 'Bearish' as const,
        label: '과매수 (Overbought) ⚠️',
        desc: '상승 에너지가 과도하게 팽창하여 단기 조정을 경계해야 하는 영역입니다.',
      };
    }
    if (val <= 30) {
      return {
        status: 'Bullish' as const,
        label: '과매도 (Oversold) 🟢',
        desc: '과도한 투매로 기술적 반등 및 바닥 형성 기대감이 증가하는 국면입니다.',
      };
    }
    if (val >= 50) {
      return {
        status: 'Neutral' as const,
        label: '강세 유지 (Neutral-Bullish) 👍',
        desc: '매수 거래량이 우위를 지키며 안정적인 상승 동력을 이어가는 상태입니다.',
      };
    }
    return {
      status: 'Neutral' as const,
      label: '약세 우려 (Neutral-Bearish) 👎',
      desc: '상승세가 다소 둔화되어 단기적인 매수 대기 상태를 유지하는 것이 적합합니다.',
    };
  };

  const getMaDiagnostic = (price: number, sma20: number, sma50: number) => {
    if (price > sma20 && sma20 > sma50) {
      return {
        status: 'Bullish' as const,
        label: '정배열 강세 상승 🚀',
        desc: '단기/장기 이동평균선이 정배열 상태를 이루어 전형적인 강세 상승 국면에 진입했습니다.',
      };
    }
    if (price < sma20 && sma20 < sma50) {
      return {
        status: 'Bearish' as const,
        label: '역배열 추세 약세 📉',
        desc: '모든 이동평균선 아래로 주가가 이탈하여 하락 추세가 장기화될 우려가 있는 리스크 구간입니다.',
      };
    }
    return {
      status: 'Neutral' as const,
      label: '추세 전환 횡보 ⚖️',
      desc: '주가와 이동평균선이 수렴하여 에너지를 응축하며 새로운 방향성을 저울질하는 단계입니다.',
    };
  };

  const getMacdDiagnostic = (hist: number, line: number, sig: number) => {
    if (hist > 0 && line > sig) {
      return {
        status: 'Bullish' as const,
        label: '골든크로스 상승 🟢',
        desc: 'MACD 라인이 시그널 선을 돌파한 후 오실레이터가 상승을 이어가며 강력한 매수 모멘텀을 형성 중입니다.',
      };
    }
    if (hist < 0 && line < sig) {
      return {
        status: 'Bearish' as const,
        label: '데드크로스 하락 🔴',
        desc: 'MACD 라인이 시그널 아래로 꺾이며 하향 침체 구간으로 진입, 조정 모멘텀이 강화되고 있습니다.',
      };
    }
    return {
      status: 'Neutral' as const,
      label: '수렴 변곡점 형성 ⚖️',
      desc: '추세 강도의 모멘텀 차이가 미미하며 조만간 돌파 방향이 확정될 변곡점에 위치해 있습니다.',
    };
  };

  const getBbDiagnostic = (price: number, upper: number, lower: number, middle: number) => {
    if (price >= upper * 0.98) {
      return {
        status: 'Bearish' as const,
        label: '상단 밴드 저항 돌파 ⚠️',
        desc: '볼린저 밴드 상단선을 돌파 혹은 근접하여 가격이 변동성 한계치에 이르렀으므로 저항 매물을 주의해야 합니다.',
      };
    }
    if (price <= lower * 1.02) {
      return {
        status: 'Bullish' as const,
        label: '하단 밴드 과매수 기회 🟢',
        desc: '밴드 하단을 건드리며 단기 낙폭 과대 현상이 나타났고, 지지 반등 가능성이 열려있는 지점입니다.',
      };
    }
    return {
      status: 'Neutral' as const,
      label: '중앙 지지선 안착 ⚖️',
      desc: '밴드 내 중심 평균선(SMA 20) 부근에서 가격 안정성을 다지며 매물 소화 과정을 거치는 중입니다.',
    };
  };

  const rsiDiag = getRsiDiagnostic(techAnalysis.latestRsi);
  const maDiag = getMaDiagnostic(techAnalysis.currentPrice, techAnalysis.latestSma20, techAnalysis.latestSma50);
  const macdDiag = getMacdDiagnostic(techAnalysis.latestHist, techAnalysis.latestMacd, techAnalysis.latestSignal);
  const bbDiag = getBbDiagnostic(techAnalysis.currentPrice, techAnalysis.latestBbUpper, techAnalysis.latestBbLower, techAnalysis.latestBbSma);

  const hasAnyIndicator =
    showSma5 ||
    showSma20 ||
    showSma60 ||
    showSma120 ||
    showSma240 ||
    showBb ||
    showRsi ||
    showMacd ||
    showEnv ||
    showFib ||
    showDonchian ||
    showAutoTrend;

  return (
    <Grid size={{ xs: 12, lg: 4 }}>
      <Stack spacing={3} sx={{ height: '100%' }}>
        {(showSma5 || showSma20 || showSma60 || showSma120 || showSma240) && maDiag && (
          <DiagnosticCard
            title="이동평균선 (MA)"
            label={maDiag.label}
            status={maDiag.status}
            desc={maDiag.desc}
            value={`SMA20: ${formatMoney(techAnalysis.latestSma20)}`}
          />
        )}

        {showRsi && rsiDiag && (
          <DiagnosticCard
            title="상대강도지수 (RSI)"
            label={rsiDiag.label}
            status={rsiDiag.status}
            desc={rsiDiag.desc}
            value={`RSI(14): ${techAnalysis.latestRsi.toFixed(1)}`}
          />
        )}

        {showMacd && macdDiag && (
          <DiagnosticCard
            title="MACD (12, 26, 9)"
            label={macdDiag.label}
            status={macdDiag.status}
            desc={macdDiag.desc}
            value={`Oscillator: ${techAnalysis.latestHist.toFixed(2)}`}
          />
        )}

        {showBb && bbDiag && (
          <DiagnosticCard
            title="볼린저 밴드"
            label={bbDiag.label}
            status={bbDiag.status}
            desc={bbDiag.desc}
            value={`Upper Band: ${formatMoney(techAnalysis.latestBbUpper)}`}
          />
        )}

        {showEnv && (
          <DiagnosticCard
            title="엔벨로프 (Envelope 10%)"
            label="단기 과매도/과매수 반등 타점 📏"
            status="Neutral"
            desc="주가가 밴드 하단을 뚫고 터치하면 과매도로 기술적 반등 매수 타점, 상단은 저항선으로 판단합니다."
            value={`Upper: ${formatMoney(techAnalysis.latestEnvUpper)}`}
          />
        )}

        {showFib && (
          <DiagnosticCard
            title="피보나치 조정대"
            label="지지선 및 저항선 예측 📐"
            status="Neutral"
            desc="상승 후 조정 시 38.2% 또는 61.8% 비율에서 강력한 지지를 받고 반등할 확률이 높습니다."
            value={`38.2%: ${formatMoney(techAnalysis.fibonacci.fib382)}`}
          />
        )}

        {showDonchian && (
          <DiagnosticCard
            title="돈천 채널 (가격 채널)"
            label="돌파 매매 추세 확인 🚀"
            status="Neutral"
            desc="주가가 상단선을 돌파하면 강력한 상승 추세의 시작, 하단 이탈 시 하락 추세 시작으로 해석합니다."
            value={`Upper: ${formatMoney(techAnalysis.latestDonchianUpper)}`}
          />
        )}

        {showAutoTrend && (
          <>
            <DiagnosticCard
              title="실시간 자동 지지선 (Auto Support)"
              label="매수 타점 및 반등 지지대 🟢"
              status="Bullish"
              desc="수학적 추세 채널 또는 피크 탐색 알고리즘을 기반으로 주가의 반등 지지층을 실시간으로 추정한 가격대입니다."
              value={`지지 가격: ${formatMoney(techAnalysis.latestSupport ?? 0)}`}
            />
            <DiagnosticCard
              title="실시간 자동 저항선 (Auto Resistance)"
              label="매도 타점 및 차익 실현 저항대 🔴"
              status="Bearish"
              desc="수학적 추세 채널 또는 피크 탐색 알고리즘을 기반으로 주가의 차익 실현 대기 매도벽을 실시간으로 추정한 가격대입니다."
              value={`저항 가격: ${formatMoney(techAnalysis.latestResistance ?? 0)}`}
            />
          </>
        )}



        {!hasAnyIndicator && (
          <Card
            sx={{
              p: 4,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              bgcolor: alpha(theme.palette.background.neutral || theme.palette.grey[200], 0.4),
              border: `1px dashed ${theme.palette.divider}`,
              borderRadius: 2,
            }}
          >
            <Typography variant="h3" sx={{ mb: 1.5 }}>
              💡
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
              활성화된 보조지표 진단이 없습니다
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: 240 }}>
              차트 종합 분석 지수 아래의 필터를 선택하여 차트 분석을 진행해 보세요!
            </Typography>
          </Card>
        )}
      </Stack>
    </Grid>
  );
}

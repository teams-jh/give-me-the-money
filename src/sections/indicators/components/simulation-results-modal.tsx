'use client';

import type { SimResult, UseChartIndicatorsReturn } from 'src/sections/indicators/hooks/use-chart-indicators';

import { useState, useEffect } from 'react';
import ChartApex from 'react-apexcharts';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import TablePagination from '@mui/material/TablePagination';

// ----------------------------------------------------------------------

interface Props {
  indicators: UseChartIndicatorsReturn;
}

export function SimulationResultsModal({ indicators }: Props) {
  const theme = useTheme() as any;
  const { showSimModal, setShowSimModal, simResults, handleTickerChange, market } = indicators;

  // Pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(6);
  const [slopeFilter, setSlopeFilter] = useState<'all' | 'positive' | 'negative'>('all');

  // Slope range states
  const [minPosSlope, setMinPosSlope] = useState<string>('');
  const [maxPosSlope, setMaxPosSlope] = useState<string>('');
  const [minNegSlope, setMinNegSlope] = useState<string>('');
  const [maxNegSlope, setMaxNegSlope] = useState<string>('');

  // Touch-then-Breakout Pattern states
  const [enablePatternFilter, setEnablePatternFilter] = useState(false);
  const [minTouchesPattern, setMinTouchesPattern] = useState(3);

  // Date range filter states
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [excludeZeroCount, setExcludeZeroCount] = useState(true);

  // Set default date range to 7 days ago to latest date when simResults is available
  useEffect(() => {
    if (simResults.length > 0) {
      const latestDate = simResults[0].prices[simResults[0].prices.length - 1]?.date;
      if (latestDate) {
        setFilterEndDate(latestDate);
        const latestObj = new Date(latestDate);
        const sevenDaysAgoObj = new Date(latestObj.getTime() - 7 * 24 * 60 * 60 * 1000);
        const y = sevenDaysAgoObj.getFullYear();
        const m = String(sevenDaysAgoObj.getMonth() + 1).padStart(2, '0');
        const d = String(sevenDaysAgoObj.getDate()).padStart(2, '0');
        setFilterStartDate(`${y}-${m}-${d}`);
      }
    }
  }, [simResults]);

  const handleClose = () => {
    setShowSimModal(false);
    setPage(0);
  };

  const handleSelectTicker = (ticker: string, name: string) => {
    handleTickerChange({ ticker, name });
    handleClose();
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSlopeFilterChange = (filter: 'all' | 'positive' | 'negative') => {
    setSlopeFilter(filter);
    setPage(0);
  };

  const getPatternDetails = (sim: SimResult) => {
    const pointsToUse = sim.filteredTouchPoints || sim.touchPoints;
    const sortedPoints = [...pointsToUse].sort((a, b) => a.x - b.x);
    const breakouts = sortedPoints.filter((p) => p.type === 'breakout');
    if (breakouts.length === 0) return null;

    for (const b of breakouts) {
      const touchesBefore = sortedPoints.filter((p) => p.type === 'touch' && p.x < b.x);
      if (touchesBefore.length >= minTouchesPattern) {
        return {
          touchesCount: touchesBefore.length,
          breakoutDate: new Date(b.x).toLocaleDateString('ko-KR'),
        };
      }
    }
    return null;
  };

  // [카운팅 기준]
  // 터치: use-chart-indicators.ts 시뮬레이션 단계에서 작도 범위(trendIndices) 내에서만 생성됨
  // 돌파: 시뮬레이션에서 전체 날짜 범위로 생성 → 여기서 분석 날짜 범위 필터 적용
  // startMs, endMs는 sim과 무관하므로 map 외부에서 한 번만 계산 (성능 최적화)
  const startMs = filterStartDate ? new Date(filterStartDate).getTime() : 0;
  const endMs = filterEndDate ? new Date(filterEndDate).getTime() : Infinity;

  const processedResults = simResults.map((sim) => {
    // 터치 포인트: 시뮬레이션 단계에서 이미 작도 범위로 제한됨 → 전체 유지
    // 돌파 포인트: 분석 날짜 범위 필터 적용
    // → 차트 마커(filteredTouchPoints)와 각 카운트 간 시각적 일치 보장
    const filteredTouchPoints = sim.touchPoints.filter(
      (tp) => tp.type === 'touch' || (tp.x >= startMs && tp.x <= endMs)
    );

    // 터치 카운트: 작도 범위 내 전체 (시뮬레이션 단계에서 이미 필터됨)
    const closeTouchCount = sim.touchPoints.filter(
      (tp) => tp.type === 'touch' && tp.priceType === 'close'
    ).length;
    const highTouchCount = sim.touchPoints.filter(
      (tp) => tp.type === 'touch' && tp.priceType === 'high'
    ).length;
    const touchCount = closeTouchCount + highTouchCount;

    // 돌파 카운트: 분석 날짜 범위 필터 적용
    const closeBreakoutCount = filteredTouchPoints.filter(
      (tp) => tp.type === 'breakout' && tp.priceType === 'close'
    ).length;
    const highBreakoutCount = filteredTouchPoints.filter(
      (tp) => tp.type === 'breakout' && tp.priceType === 'high'
    ).length;
    const breakoutCount = closeBreakoutCount + highBreakoutCount;

    const totalCount = touchCount + breakoutCount;

    return {
      ...sim,
      filteredTouchPoints,
      touchCount,
      closeTouchCount,
      highTouchCount,
      breakoutCount,
      closeBreakoutCount,
      highBreakoutCount,
      totalCount,
    };
  });

  // Sort by totalCount in descending order
  const sortedProcessed = [...processedResults].sort((a, b) => (b.totalCount ?? 0) - (a.totalCount ?? 0));

  // Filter results by slope type, slope range, Touch-then-Breakout pattern, and zero-count exclusion
  const filteredResults = sortedProcessed.filter((sim) => {
    if (excludeZeroCount && (sim.totalCount ?? 0) === 0) {
      return false;
    }

    const slopeVal = sim.slope ?? 0;
    if (slopeFilter === 'positive') {
      if (sim.slopeType !== 'positive') return false;
      const minVal = minPosSlope !== '' ? parseFloat(minPosSlope) : null;
      const maxVal = maxPosSlope !== '' ? parseFloat(maxPosSlope) : null;
      if (minVal !== null && !isNaN(minVal) && slopeVal < minVal) return false;
      if (maxVal !== null && !isNaN(maxVal) && slopeVal > maxVal) return false;
    } else if (slopeFilter === 'negative') {
      if (sim.slopeType !== 'negative') return false;
      const minVal = minNegSlope !== '' ? parseFloat(minNegSlope) : null;
      const maxVal = maxNegSlope !== '' ? parseFloat(maxNegSlope) : null;
      if (minVal !== null && !isNaN(minVal) && slopeVal < minVal) return false;
      if (maxVal !== null && !isNaN(maxVal) && slopeVal > maxVal) return false;
    }

    if (enablePatternFilter) {
      const pattern = getPatternDetails(sim);
      if (!pattern) return false;
    }

    return true;
  });

  // Get active subset of paginated simulation results
  const paginatedResults = filteredResults.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const getMiniChartOptions = (sim: SimResult) => {
    const annotations: any = { points: [] };

    // Push pre-calculated touch/breakout points (filtered)
    const pointsToUse = sim.filteredTouchPoints || sim.touchPoints;
    pointsToUse.forEach((tp) => {
      const isClose = tp.priceType === 'close';
      const isBreak = tp.type === 'breakout';
      let color = theme.palette.warning.main;

      if (isBreak) {
        color = isClose ? theme.palette.secondary.main : theme.palette.secondary.light;
      } else {
        color = isClose ? theme.palette.error.main : theme.palette.warning.main;
      }

      annotations.points.push({
        x: tp.x,
        y: tp.y,
        marker: {
          size: 5,
          fillColor: color,
          strokeColor: '#FFFFFF',
          strokeWidth: 1.5,
        },
      });
    });

    const highs = sim.prices.map((p) => p.high || p.close);
    const lows = sim.prices.map((p) => p.low || p.close);
    const maxVal = Math.max(...highs);
    const minVal = Math.min(...lows);
    const diff = maxVal - minVal;

    const yMin = minVal - (diff || minVal) * 0.05;
    const yMax = maxVal + (diff || maxVal) * 0.05;

    // Line curve options
    const lineCurve = indicators.lineCurve || 'straight';

    // Series types: candlestick, line, line
    const curves = ['straight', lineCurve, lineCurve];

    return {
      chart: {
        id: `mini-chart-${sim.ticker}`,
        sparkline: { enabled: true },
        background: 'transparent',
      },
      stroke: {
        curve: curves as any,
        width: [1, 2, 2],
        dashArray: [0, 4, 4],
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: theme.palette.error.main,
            downward: theme.palette.info.main,
          },
          wick: { useFillColor: true },
        },
      },
      annotations,
      xaxis: {
        type: 'datetime',
      },
      yaxis: {
        min: yMin,
        max: yMax,
      },
      tooltip: {
        theme: theme.palette.mode,
        x: { format: 'yyyy-MM-dd' },
      },
      grid: {
        show: false,
      },
    };
  };

  const getMiniChartSeries = (sim: SimResult) => {
    const series: any[] = [
      {
        name: '주가 (OHLC)',
        type: 'candlestick',
        data: sim.prices.map((p) => ({
          x: new Date(p.date).getTime(),
          y: [p.open || p.close, p.high || p.close, p.low || p.close, p.close],
        })),
      },
    ];

    if (indicators.trendAlgo === 'zigzag' && sim.zigzagData) {
      series.push({
        name: '지그재그 파동선',
        type: 'line',
        data: sim.zigzagData,
      });
    } else {
      if (sim.supportData) {
        series.push({
          name: '자동 지지선 (Support)',
          type: 'line',
          data: sim.supportData,
        });
      }
      if (sim.resistanceData) {
        series.push({
          name: '자동 저항선 (Resistance)',
          type: 'line',
          data: sim.resistanceData,
        });
      }
    }

    return series;
  };

  return (
    <Dialog
      open={showSimModal}
      onClose={handleClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          p: 3,
          bgcolor: 'background.paper',
          background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.background.neutral || theme.palette.grey[100], 0.7)} 100%)`,
        },
      }}
    >
      {/* Modal Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            📊 {market === 'US' ? '미국 주식' : '국내 주식'} 추세선 터치 & 돌파 종합 시뮬레이션
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            설정하신 파라미터(터치 인정 범위 -a%, 돌파 인정 범위 +b%, 터치 인정 기준, 분석 알고리즘)를 기반으로{' '}
            <strong>전체 {simResults.length}개 종목</strong>의 상단 저항선 터치 및 돌파 횟수 총합이 많은 순으로 정렬한
            결과입니다.
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: 'text.secondary' }}>
          ✕
        </IconButton>
      </Stack>

      {/* Filters Panel */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        {/* 📅 Date Range Filter */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.secondary', minWidth: 160 }}>
            📅 분석 날짜 범위 필터:
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => {
                setFilterStartDate(e.target.value);
                setPage(0);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
                color: theme.palette.text.primary,
                fontSize: '0.875rem',
                fontWeight: 600,
                outline: 'none',
              }}
            />
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
              ~
            </Typography>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => {
                setFilterEndDate(e.target.value);
                setPage(0);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
                color: theme.palette.text.primary,
                fontSize: '0.875rem',
                fontWeight: 600,
                outline: 'none',
              }}
            />

            {/* Quick Filter Buttons */}
            <Button
              size="small"
              variant="outlined"
              color="primary"
              onClick={() => {
                if (simResults.length > 0) {
                  const latestDate = simResults[0].prices[simResults[0].prices.length - 1]?.date;
                  if (latestDate) {
                    setFilterEndDate(latestDate);
                    const latestObj = new Date(latestDate);
                    const sevenDaysAgoObj = new Date(latestObj.getTime() - 7 * 24 * 60 * 60 * 1000);
                    const y = sevenDaysAgoObj.getFullYear();
                    const m = String(sevenDaysAgoObj.getMonth() + 1).padStart(2, '0');
                    const d = String(sevenDaysAgoObj.getDate()).padStart(2, '0');
                    setFilterStartDate(`${y}-${m}-${d}`);
                  }
                }
                setPage(0);
              }}
              sx={{ fontWeight: 800, fontSize: '0.75rem', p: '4px 10px', ml: 1 }}
            >
              최근 7일
            </Button>

            <Button
              size="small"
              variant="text"
              color="warning"
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setPage(0);
              }}
              sx={{ fontWeight: 800, fontSize: '0.75rem', p: '4px 10px' }}
            >
              전체 기간
            </Button>

            {/* Zero Count Exclusion Toggle */}
            <Chip
              label={excludeZeroCount ? '터치/돌파 없는 종목 제외 ON' : '모든 종목 표시'}
              color={excludeZeroCount ? 'warning' : 'default'}
              variant={excludeZeroCount ? 'filled' : 'outlined'}
              onClick={() => {
                setExcludeZeroCount(!excludeZeroCount);
                setPage(0);
              }}
              sx={{ fontWeight: 800, cursor: 'pointer', ml: 2 }}
            />
          </Stack>
        </Stack>

        {/* Dynamic Slope Filter Chips */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.secondary', minWidth: 160 }}>
            📈 저항선 기울기 필터:
          </Typography>
          <Stack direction="row" spacing={1}>
            {([
              { key: 'all', label: '전체 (All)' },
              { key: 'positive', label: '📈 양의 기울기 (우상향)' },
              { key: 'negative', label: '📉 음의 기울기 (우하향)' },
            ] as const).map((opt) => {
              const isActive = slopeFilter === opt.key;
              return (
                <Chip
                  key={opt.key}
                  label={opt.label}
                  color={isActive ? 'warning' : 'default'}
                  variant={isActive ? 'filled' : 'outlined'}
                  onClick={() => handleSlopeFilterChange(opt.key)}
                  sx={{ fontWeight: isActive ? 700 : 500, cursor: 'pointer' }}
                />
              );
            })}
          </Stack>
        </Stack>

        {/* Slope Range Filter (Positive / Negative) */}
        {slopeFilter !== 'all' && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.background.neutral || theme.palette.grey[100], 0.4),
              border: `1px dashed ${theme.palette.divider}`,
              alignSelf: 'flex-start',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', minWidth: 140 }}>
              📏 {slopeFilter === 'positive' ? '양의' : '음의'} 기울기 범위 (%) :
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              <input
                type="number"
                step="any"
                placeholder={slopeFilter === 'positive' ? "최소 (예: 0)" : "최소 (예: -50)"}
                value={slopeFilter === 'positive' ? minPosSlope : minNegSlope}
                onChange={(e) => {
                  const val = e.target.value;
                  if (slopeFilter === 'positive') setMinPosSlope(val);
                  else setMinNegSlope(val);
                  setPage(0);
                }}
                style={{
                  width: '110px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.background.paper,
                  color: theme.palette.text.primary,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                ~
              </Typography>
              <input
                type="number"
                step="any"
                placeholder={slopeFilter === 'positive' ? "최대 (예: 30)" : "최대 (예: 0)"}
                value={slopeFilter === 'positive' ? maxPosSlope : maxNegSlope}
                onChange={(e) => {
                  const val = e.target.value;
                  if (slopeFilter === 'positive') setMaxPosSlope(val);
                  else setMaxNegSlope(val);
                  setPage(0);
                }}
                style={{
                  width: '110px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.background.paper,
                  color: theme.palette.text.primary,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                %
              </Typography>

              {/* Reset/Clear button */}
              {((slopeFilter === 'positive' && (minPosSlope !== '' || maxPosSlope !== '')) ||
                (slopeFilter === 'negative' && (minNegSlope !== '' || maxNegSlope !== ''))) && (
                <Button
                  size="small"
                  variant="text"
                  color="warning"
                  onClick={() => {
                    if (slopeFilter === 'positive') {
                      setMinPosSlope('');
                      setMaxPosSlope('');
                    } else {
                      setMinNegSlope('');
                      setMaxNegSlope('');
                    }
                    setPage(0);
                  }}
                  sx={{
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    p: '2px 8px',
                    minWidth: 'auto',
                    ml: 1,
                  }}
                >
                  초기화
                </Button>
              )}
            </Stack>
          </Stack>
        )}

        {/* Touch-then-Breakout Pattern Filter */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.secondary', minWidth: 160 }}>
            🎯 돌파 패턴 필터:
          </Typography>
          
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={enablePatternFilter ? '⚡ 터치 후 돌파 패턴 ON' : '터치 후 돌파 패턴 OFF'}
              color={enablePatternFilter ? 'primary' : 'default'}
              variant={enablePatternFilter ? 'filled' : 'outlined'}
              onClick={() => {
                setEnablePatternFilter(!enablePatternFilter);
                setPage(0);
              }}
              sx={{ fontWeight: 800, cursor: 'pointer' }}
            />

            {enablePatternFilter && (
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ ml: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                  최소 터치 횟수 (N): <span style={{ color: theme.palette.primary.main, fontWeight: 900 }}>{minTouchesPattern}회</span>
                </Typography>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={minTouchesPattern}
                  onChange={(e) => {
                    setMinTouchesPattern(Number(e.target.value));
                    setPage(0);
                  }}
                  style={{
                    width: '120px',
                    cursor: 'pointer',
                    accentColor: theme.palette.primary.main,
                  }}
                />
              </Stack>
            )}
          </Stack>

          {filteredResults.length !== simResults.length && (
            <Typography variant="caption" sx={{ color: 'text.secondary', ml: { md: 'auto' } }}>
              (필터 결과: <strong>{filteredResults.length}개 종목</strong> / 전체 {simResults.length}개)
            </Typography>
          )}
        </Stack>
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {/* Tickers ranked cards Grid */}
      {filteredResults.length === 0 ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            🔍 해당 날짜 범위 및 필터 조건에 부합하는 시뮬레이션 결과가 없습니다.
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled', mt: 1 }}>
            날짜 범위를 넓히거나 필터링 조건을 완화해 보세요.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {paginatedResults.map((sim, index) => {
            const rank = page * rowsPerPage + index + 1;
            const chartSeries = getMiniChartSeries(sim);
            const chartOptions = getMiniChartOptions(sim);
            const colors = ['#00E676', theme.palette.success.main, theme.palette.error.main];
            const patternDetails = getPatternDetails(sim);

            return (
              <Grid key={sim.ticker} size={{ xs: 12, md: 4 }}>
                <Card
                  sx={{
                    p: 2.5,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    boxShadow: theme.customShadows?.card,
                    background: theme.palette.background.paper,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: theme.customShadows?.z16,
                    },
                  }}
                >
                  {/* Card Top Information */}
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                    <Box sx={{ maxWidth: '60%' }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Chip
                          label={`#${rank}`}
                          size="small"
                          color={rank <= 3 ? 'warning' : 'default'}
                          sx={{ fontWeight: 900, px: 0.5, borderRadius: 1 }}
                        />
                        <Typography variant="subtitle2" noWrap sx={{ fontWeight: 800 }}>
                          {sim.name}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        코드: {sim.ticker}
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <Chip
                          label={`기울기: ${(sim.slope ?? 0) > 0 ? '+' : ''}${(sim.slope ?? 0).toFixed(2)}%`}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            bgcolor: alpha(
                              sim.slopeType === 'positive'
                                ? theme.palette.error.main
                                : sim.slopeType === 'negative'
                                  ? theme.palette.info.main
                                  : theme.palette.text.secondary,
                              0.12
                            ),
                            color:
                              sim.slopeType === 'positive'
                                ? 'error.main'
                                : sim.slopeType === 'negative'
                                  ? 'info.main'
                                  : 'text.secondary',
                            border: `1px solid ${alpha(
                              sim.slopeType === 'positive'
                                ? theme.palette.error.main
                                : sim.slopeType === 'negative'
                                  ? theme.palette.info.main
                                  : theme.palette.text.secondary,
                              0.25
                            )}`,
                          }}
                        />
                      </Box>
                    </Box>

                    {/* Touch & Breakout Badges */}
                    <Stack spacing={0.5} alignItems="flex-end">
                      <Typography variant="subtitle2" sx={{ color: 'primary.main', fontWeight: 900, fontSize: '0.85rem' }}>
                        ✨ 총합: {sim.touchCount + sim.breakoutCount}회
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 800, fontSize: '0.75rem' }}>
                        🔴 터치: {sim.touchCount}회 (종 {sim.closeTouchCount}/고 {sim.highTouchCount})
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 800, fontSize: '0.75rem' }}>
                        ⚡ 돌파: {sim.breakoutCount}회 (종 {sim.closeBreakoutCount}/고 {sim.highBreakoutCount})
                      </Typography>
                    </Stack>
                  </Stack>

                  {/* Sparkline Candlestick Chart */}
                  <Box sx={{ height: 180, mb: 2, bgcolor: alpha(theme.palette.action.hover, 0.3), borderRadius: 1.5, p: 1 }}>
                    <ChartApex
                      options={chartOptions}
                      series={chartSeries}
                      type="line"
                      height="100%"
                      colors={colors}
                    />
                  </Box>

                  {patternDetails && (
                    <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'center' }}>
                      <Chip
                        label={`🎯 패턴: 저항선 ${patternDetails.touchesCount}회 터치 후 돌파 완료`}
                        size="small"
                        color="success"
                        sx={{
                          fontWeight: 800,
                          fontSize: '0.75rem',
                          px: 1,
                          py: 1.5,
                          background: `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${theme.palette.success.dark} 100%)`,
                          color: '#fff',
                          boxShadow: `0 2px 8px ${alpha(theme.palette.success.main, 0.25)}`,
                        }}
                      />
                    </Box>
                  )}

                  {/* Action button */}
                  <Button
                    fullWidth
                    variant="outlined"
                    color="warning"
                    onClick={() => handleSelectTicker(sim.ticker, sim.name)}
                    sx={{
                      fontWeight: 700,
                      borderRadius: 1.5,
                      borderWidth: 1.5,
                      '&:hover': { borderWidth: 1.5 },
                    }}
                  >
                    🔍 이 종목 차트 분석하기
                  </Button>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Pagination Controller */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
        <TablePagination
          component="div"
          count={filteredResults.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[6, 12, 18]}
          labelRowsPerPage="페이지당 개수:"
          sx={{ border: 'none' }}
        />
      </Box>
    </Dialog>
  );
}

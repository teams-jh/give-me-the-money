'use client';

import type { UseTrendSimulationReturn } from '../hooks/use-trend-simulation';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import CircularProgress from '@mui/material/CircularProgress';

// ----------------------------------------------------------------------

interface Props { sim: UseTrendSimulationReturn; }

const PERIOD_OPTIONS = [
  { value: '3m', label: '3개월' },
  { value: '1y', label: '1년' },
  { value: '2y', label: '2년' },
  { value: '3y', label: '3년' },
] as const;

// ----------------------------------------------------------------------

export function TrendInputPanel({ sim }: Props) {
  const theme = useTheme() as any;

  const {
    simMarket, setSimMarket,
    simPeriods, setSimPeriods,
    trendBase, setTrendBase,
    trendAlgo, setTrendAlgo,
    zigzagThreshold, setZigzagThreshold,
    regressionStdDev, setRegressionStdDev,
    trendStartDate, setTrendStartDate,
    trendEndDate, setTrendEndDate,
    trendTouchBasis, setTrendTouchBasis,
    trendTouchTolerance, setTrendTouchTolerance,
    trendBreakoutTolerance, setTrendBreakoutTolerance,
    filterStartDate, setFilterStartDate,
    filterEndDate, setFilterEndDate,
    slopeFilter, setSlopeFilter,
    slopeMin, setSlopeMin,
    slopeMax, setSlopeMax,
    enablePatternFilter, setEnablePatternFilter,
    minTouchesPattern, setMinTouchesPattern,
    isSimulating, runSimulation,
  } = sim;

  const togglePeriod = (p: typeof PERIOD_OPTIONS[number]['value']) => {
    setSimPeriods(
      simPeriods.includes(p) ? simPeriods.filter(x => x !== p) : [...simPeriods, p]
    );
  };

  const cardSx = {
    p: 2.5,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 2,
    boxShadow: theme.customShadows?.card,
  };

  return (
    <Card sx={{ p: 3, border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
      <Stack spacing={3}>

        {/* ── 헤더 + 실행 버튼 ── */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              ⚙️ 시뮬레이션 설정
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              선택한 모든 기간 조건을 동시에 만족하는 종목(AND 교집합)만 결과에 표시됩니다.
            </Typography>
          </Box>
          <Button
            variant="contained"
            color="warning"
            onClick={runSimulation}
            disabled={isSimulating || simPeriods.length === 0}
            startIcon={isSimulating ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ fontWeight: 800, px: 3, py: 1.2, borderRadius: 1.5, whiteSpace: 'nowrap' }}
          >
            {isSimulating ? '시뮬레이션 중...' : '📊 전체 종목 시뮬레이션'}
          </Button>
        </Stack>

        <Divider />

        <Grid container spacing={3}>

          {/* ── 1. 시장 선택 ── */}
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>🌍 시장</Typography>
            <Stack direction="row" spacing={1}>
              {(['US', 'KR'] as const).map(m => (
                <Chip
                  key={m}
                  label={m === 'US' ? '미국' : '국내'}
                  color={simMarket === m ? 'primary' : 'default'}
                  variant={simMarket === m ? 'filled' : 'outlined'}
                  onClick={() => setSimMarket(m)}
                  sx={{ flex: 1, fontWeight: simMarket === m ? 700 : 500, cursor: 'pointer' }}
                />
              ))}
            </Stack>
          </Grid>

          {/* ── 2. 기간 다중선택 (AND) ── */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>
              📅 기간{' '}
              <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>
                (AND 교집합 — 복수 선택 가능)
              </Typography>
            </Typography>
            <Stack direction="row" spacing={1}>
              {PERIOD_OPTIONS.map(({ value, label }) => {
                const active = simPeriods.includes(value);
                return (
                  <Chip
                    key={value}
                    label={label}
                    color={active ? 'info' : 'default'}
                    variant={active ? 'filled' : 'outlined'}
                    onClick={() => togglePeriod(value)}
                    sx={{ flex: 1, fontWeight: active ? 700 : 500, cursor: 'pointer' }}
                  />
                );
              })}
            </Stack>
          </Grid>

          {/* ── 3. 분석 기준 가격 ── */}
          <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>🎯 분석 기준 가격</Typography>
            <Stack direction="row" spacing={1}>
              {([
                { key: 'highlow', label: '고/저점' },
                { key: 'close',   label: '종가' },
                { key: 'open',    label: '시가' },
              ] as const).map(({ key, label }) => (
                <Chip
                  key={key}
                  label={label}
                  color={trendBase === key ? 'primary' : 'default'}
                  variant={trendBase === key ? 'filled' : 'outlined'}
                  onClick={() => setTrendBase(key)}
                  sx={{ flex: 1, fontWeight: trendBase === key ? 700 : 500, cursor: 'pointer' }}
                />
              ))}
            </Stack>
          </Grid>

          {/* ── 4. 추세 분석 알고리즘 ── */}
          <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>⚙️ 추세 알고리즘</Typography>
            <Stack direction="row" spacing={1}>
              {([
                { key: 'swing',      label: '스윙' },
                { key: 'zigzag',     label: '지그재그' },
                { key: 'regression', label: '회귀' },
              ] as const).map(({ key, label }) => (
                <Chip
                  key={key}
                  label={label}
                  color={trendAlgo === key ? 'warning' : 'default'}
                  variant={trendAlgo === key ? 'filled' : 'outlined'}
                  onClick={() => setTrendAlgo(key)}
                  sx={{ flex: 1, fontWeight: trendAlgo === key ? 700 : 500, cursor: 'pointer' }}
                />
              ))}
            </Stack>
          </Grid>

          {/* ── 4-1/4-2. 알고리즘 파라미터 ── */}
          <Grid size={{ xs: 12, md: 2 }}>
            {trendAlgo === 'zigzag' && (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                  ⚡ 지그재그 임계값:{' '}
                  <span style={{ color: theme.palette.warning.main }}>{zigzagThreshold}%</span>
                </Typography>
                <input type="range" min={1} max={10} value={zigzagThreshold}
                  onChange={e => setZigzagThreshold(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: theme.palette.warning.main }}
                />
              </Box>
            )}
            {trendAlgo === 'regression' && (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                  ⚡ 표준편차 배수:{' '}
                  <span style={{ color: theme.palette.warning.main }}>{regressionStdDev.toFixed(1)}x</span>
                </Typography>
                <input type="range" min={1.0} max={3.0} step={0.1} value={regressionStdDev}
                  onChange={e => setRegressionStdDev(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: theme.palette.warning.main }}
                />
              </Box>
            )}
          </Grid>

          {/* ── 5. 추세선 작도 범위 ── */}
          <Grid size={{ xs: 12 }}>
            <Card sx={{ ...cardSx, bgcolor: alpha(theme.palette.primary.main, 0.04), border: `1px dashed ${alpha(theme.palette.primary.main, 0.2)}` }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                <Box sx={{ flexShrink: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main' }}>
                    📅 추세선 작도 범위
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    비워두면 분석 기간 전체 사용
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
                  {[
                    { val: trendStartDate, set: setTrendStartDate, max: trendEndDate || undefined },
                    { val: trendEndDate,   set: setTrendEndDate,   min: trendStartDate || undefined },
                  ].map((cfg, i) => (
                    <input
                      key={i}
                      type="date"
                      value={cfg.val}
                      onChange={e => cfg.set(e.target.value)}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper,
                        color: theme.palette.text.primary,
                        fontSize: '0.875rem',
                      }}
                    />
                  ))}
                  <Typography variant="body2" sx={{ color: 'text.secondary', px: 0.5 }}>~</Typography>
                  <Button
                    size="small" variant="outlined"
                    onClick={() => { setTrendStartDate(''); setTrendEndDate(''); }}
                    sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
                  >
                    초기화
                  </Button>
                </Stack>
              </Stack>
            </Card>
          </Grid>

          {/* ── 6~8. 터치/돌파 파라미터 ── */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>🎯 터치 인정 기준</Typography>
            <Stack direction="row" spacing={1}>
              {([
                { key: 'both',  label: '종가+고가' },
                { key: 'close', label: '종가만' },
                { key: 'high',  label: '고가만' },
              ] as const).map(({ key, label }) => (
                <Chip key={key} label={label} size="small"
                  color={trendTouchBasis === key ? 'warning' : 'default'}
                  variant={trendTouchBasis === key ? 'filled' : 'outlined'}
                  onClick={() => setTrendTouchBasis(key)}
                  sx={{ flex: 1, fontWeight: trendTouchBasis === key ? 700 : 500, cursor: 'pointer' }}
                />
              ))}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
              📐 터치 인정 범위:{' '}
              <span style={{ color: theme.palette.warning.main }}>-{trendTouchTolerance}%</span>
            </Typography>
            <input type="range" min={0.1} max={5.0} step={0.1} value={trendTouchTolerance}
              onChange={e => setTrendTouchTolerance(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer', accentColor: theme.palette.warning.main }}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
              📈 돌파 인정 범위:{' '}
              <span style={{ color: theme.palette.secondary.main }}>+{trendBreakoutTolerance}%</span>
            </Typography>
            <input type="range" min={0.1} max={5.0} step={0.1} value={trendBreakoutTolerance}
              onChange={e => setTrendBreakoutTolerance(Number(e.target.value))}
              style={{ width: '100%', cursor: 'pointer', accentColor: theme.palette.secondary.main }}
            />
          </Grid>
        </Grid>

        <Divider />

        {/* ── 결과 필터 ── */}
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>🔍 결과 필터</Typography>

        <Grid container spacing={3}>

          {/* ── 9. 분석 날짜 범위 (돌파 카운트 필터) ── */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
              📅 분석 날짜 범위{' '}
              <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>
                (돌파 카운트 적용)
              </Typography>
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <input type="date" value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: '0.8rem' }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>~</Typography>
              <input type="date" value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: '0.8rem' }}
              />
            </Stack>
          </Grid>

          {/* ── 10. 기울기 필터 ── */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>📉 저항선 기울기 필터</Typography>
            <Stack direction="row" spacing={1}>
              {([
                { key: 'all',      label: '전체' },
                { key: 'positive', label: '양의 기울기' },
                { key: 'negative', label: '음의 기울기' },
              ] as const).map(({ key, label }) => (
                <Chip key={key} label={label} size="small"
                  color={slopeFilter === key ? 'primary' : 'default'}
                  variant={slopeFilter === key ? 'filled' : 'outlined'}
                  onClick={() => { setSlopeFilter(key); setSlopeMin(''); setSlopeMax(''); }}
                  sx={{ flex: 1, fontWeight: slopeFilter === key ? 700 : 500, cursor: 'pointer' }}
                />
              ))}
            </Stack>
            {slopeFilter !== 'all' && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <input
                  type="number" placeholder="최소" value={slopeMin}
                  onChange={e => setSlopeMin(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: '0.8rem' }}
                />
                <input
                  type="number" placeholder="최대" value={slopeMax}
                  onChange={e => setSlopeMax(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, fontSize: '0.8rem' }}
                />
              </Stack>
            )}
          </Grid>

          {/* ── 11. 돌파 패턴 필터 ── */}
          <Grid size={{ xs: 12, md: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>🎯 돌파 패턴 필터</Typography>
            <Chip
              label={enablePatternFilter ? `⚡ 터치 후 돌파 패턴 ON` : '터치 후 돌파 패턴 OFF'}
              color={enablePatternFilter ? 'success' : 'default'}
              variant={enablePatternFilter ? 'filled' : 'outlined'}
              onClick={() => setEnablePatternFilter(!enablePatternFilter)}
              sx={{ fontWeight: enablePatternFilter ? 700 : 500, cursor: 'pointer', mb: 1 }}
            />
            {enablePatternFilter && (
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  최소 터치 횟수:{' '}
                  <span style={{ color: theme.palette.primary.main, fontWeight: 900 }}>{minTouchesPattern}회</span>
                </Typography>
                <input type="range" min={1} max={10} value={minTouchesPattern}
                  onChange={e => setMinTouchesPattern(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: theme.palette.primary.main }}
                />
              </Box>
            )}
          </Grid>
        </Grid>

      </Stack>
    </Card>
  );
}

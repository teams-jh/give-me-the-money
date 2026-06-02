'use client';

import { useState, useEffect } from 'react';

import type { PeriodKey } from 'src/sections/top100/types';
import type { PeriodConfig, UseTrendSimulationReturn } from '../hooks/use-trend-simulation';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Tabs from '@mui/material/Tabs';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import CircularProgress from '@mui/material/CircularProgress';

// ----------------------------------------------------------------------

interface Props { sim: UseTrendSimulationReturn; }

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '3m', label: '3개월' },
  { value: '1y', label: '1년' },
  { value: '2y', label: '2년' },
  { value: '3y', label: '3년' },
];

const inputStyle = (theme: any) => ({
  padding: '7px 10px', borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  fontSize: '0.8rem', width: '100%',
});

// ── 기간별 설정 패널 ────────────────────────────────────────────────────

function PeriodConfigPanel({
  period, config, onChange, theme,
}: {
  period: PeriodKey;
  config: PeriodConfig;
  onChange: (updates: Partial<PeriodConfig>) => void;
  theme: any;
}) {
  const accentColor = theme.palette.warning.main;
  const secColor    = theme.palette.secondary.main;

  return (
    <Grid container spacing={2.5}>

      {/* 추세 알고리즘 */}
      <Grid size={{ xs: 12, md: 4 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>⚙️ 추세 알고리즘</Typography>
        <Stack direction="row" spacing={1}>
          {([
            { key: 'swing',      label: '스윙' },
            { key: 'zigzag',     label: '지그재그' },
            { key: 'regression', label: '회귀' },
          ] as const).map(({ key, label }) => (
            <Chip key={key} label={label} size="small"
              color={config.trendAlgo === key ? 'warning' : 'default'}
              variant={config.trendAlgo === key ? 'filled' : 'outlined'}
              onClick={() => onChange({ trendAlgo: key })}
              sx={{ flex: 1, fontWeight: config.trendAlgo === key ? 700 : 500, cursor: 'pointer' }}
            />
          ))}
        </Stack>
        {config.trendAlgo === 'zigzag' && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              지그재그 임계값: <span style={{ color: accentColor }}>{config.zigzagThreshold}%</span>
            </Typography>
            <input type="range" min={1} max={10} value={config.zigzagThreshold}
              onChange={e => onChange({ zigzagThreshold: Number(e.target.value) })}
              style={{ width: '100%', cursor: 'pointer', accentColor }}
            />
          </Box>
        )}
        {config.trendAlgo === 'regression' && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              표준편차 배수: <span style={{ color: accentColor }}>{config.regressionStdDev.toFixed(1)}x</span>
            </Typography>
            <input type="range" min={1.0} max={3.0} step={0.1} value={config.regressionStdDev}
              onChange={e => onChange({ regressionStdDev: Number(e.target.value) })}
              style={{ width: '100%', cursor: 'pointer', accentColor }}
            />
          </Box>
        )}
      </Grid>

      {/* 분석 기준 가격 */}
      <Grid size={{ xs: 12, md: 3 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>🎯 분석 기준 가격</Typography>
        <Stack direction="row" spacing={1}>
          {([
            { key: 'highlow', label: '고/저점' },
            { key: 'close',   label: '종가' },
            { key: 'open',    label: '시가' },
          ] as const).map(({ key, label }) => (
            <Chip key={key} label={label} size="small"
              color={config.trendBase === key ? 'primary' : 'default'}
              variant={config.trendBase === key ? 'filled' : 'outlined'}
              onClick={() => onChange({ trendBase: key })}
              sx={{ flex: 1, fontWeight: config.trendBase === key ? 700 : 500, cursor: 'pointer' }}
            />
          ))}
        </Stack>
      </Grid>

      {/* 작도 범위 */}
      <Grid size={{ xs: 12, md: 5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
          📅 추세선 작도 범위
          <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
            (비워두면 전체 기간)
          </Typography>
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <input type="date" value={config.trendStartDate} max={config.trendEndDate || undefined}
            onChange={e => onChange({ trendStartDate: e.target.value })}
            style={inputStyle(theme)}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>~</Typography>
          <input type="date" value={config.trendEndDate} min={config.trendStartDate || undefined}
            onChange={e => onChange({ trendEndDate: e.target.value })}
            style={inputStyle(theme)}
          />
        </Stack>
      </Grid>

      {/* 터치 인정 기준 */}
      <Grid size={{ xs: 12, md: 4 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>🎯 터치 인정 기준</Typography>
        <Stack direction="row" spacing={1}>
          {([
            { key: 'both',  label: '종가+고가' },
            { key: 'close', label: '종가만' },
            { key: 'high',  label: '고가만' },
          ] as const).map(({ key, label }) => (
            <Chip key={key} label={label} size="small"
              color={config.trendTouchBasis === key ? 'warning' : 'default'}
              variant={config.trendTouchBasis === key ? 'filled' : 'outlined'}
              onClick={() => onChange({ trendTouchBasis: key })}
              sx={{ flex: 1, fontWeight: config.trendTouchBasis === key ? 700 : 500, cursor: 'pointer' }}
            />
          ))}
        </Stack>
      </Grid>

      {/* 터치 인정 범위 */}
      <Grid size={{ xs: 12, md: 4 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
          📐 터치 인정 범위: <span style={{ color: accentColor }}>-{config.trendTouchTolerance}%</span>
        </Typography>
        <input type="range" min={0.1} max={5.0} step={0.1} value={config.trendTouchTolerance}
          onChange={e => onChange({ trendTouchTolerance: Number(e.target.value) })}
          style={{ width: '100%', cursor: 'pointer', accentColor }}
        />
      </Grid>

      {/* 돌파 인정 범위 */}
      <Grid size={{ xs: 12, md: 4 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
          📈 돌파 인정 범위: <span style={{ color: secColor }}>+{config.trendBreakoutTolerance}%</span>
        </Typography>
        <input type="range" min={0.1} max={5.0} step={0.1} value={config.trendBreakoutTolerance}
          onChange={e => onChange({ trendBreakoutTolerance: Number(e.target.value) })}
          style={{ width: '100%', cursor: 'pointer', accentColor: secColor }}
        />
      </Grid>

      {/* 분석 날짜 범위 */}
      <Grid size={{ xs: 12, md: 5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
          📅 분석 날짜 범위
          <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
            (돌파 카운트 기간)
          </Typography>
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <input type="date" value={config.filterStartDate} max={config.filterEndDate || undefined}
            onChange={e => onChange({ filterStartDate: e.target.value })}
            style={inputStyle(theme)}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>~</Typography>
          <input type="date" value={config.filterEndDate} min={config.filterStartDate || undefined}
            onChange={e => onChange({ filterEndDate: e.target.value })}
            style={inputStyle(theme)}
          />
        </Stack>
      </Grid>

      {/* 기울기 필터 */}
      <Grid size={{ xs: 12, md: 4 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>📉 저항선 기울기 필터</Typography>
        <Stack direction="row" spacing={1}>
          {([
            { key: 'all',      label: '전체' },
            { key: 'positive', label: '양의 기울기' },
            { key: 'negative', label: '음의 기울기' },
          ] as const).map(({ key, label }) => (
            <Chip key={key} label={label} size="small"
              color={config.slopeFilter === key ? 'primary' : 'default'}
              variant={config.slopeFilter === key ? 'filled' : 'outlined'}
              onClick={() => onChange({ slopeFilter: key, slopeMin: '', slopeMax: '' })}
              sx={{ flex: 1, fontWeight: config.slopeFilter === key ? 700 : 500, cursor: 'pointer' }}
            />
          ))}
        </Stack>
        {config.slopeFilter !== 'all' && (
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <input type="number" placeholder="최소" value={config.slopeMin}
              onChange={e => onChange({ slopeMin: e.target.value })}
              style={{ ...inputStyle(theme), flex: 1 }}
            />
            <input type="number" placeholder="최대" value={config.slopeMax}
              onChange={e => onChange({ slopeMax: e.target.value })}
              style={{ ...inputStyle(theme), flex: 1 }}
            />
          </Stack>
        )}
      </Grid>

    </Grid>
  );
}

// ── 메인 패널 ───────────────────────────────────────────────────────────

export function TrendInputPanel({ sim }: Props) {
  const theme = useTheme() as any;
  const {
    simMarket, setSimMarket,
    simPeriods, togglePeriod,
    periodConfigs, updatePeriodConfig,
    isSimulating, runSimulation,
    enablePatternFilter, setEnablePatternFilter,
    minTouchesPattern, setMinTouchesPattern,
  } = sim;

  const [activeTab, setActiveTab] = useState<PeriodKey>(simPeriods[0] ?? '1y');

  // 탭이 없어지면 첫 번째로 이동
  useEffect(() => {
    if (!simPeriods.includes(activeTab)) setActiveTab(simPeriods[0] ?? '1y');
  }, [simPeriods, activeTab]);

  const currentConfig = periodConfigs[activeTab];

  return (
    <Card sx={{ p: 3, border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
      <Stack spacing={3}>

        {/* 헤더 */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>⚙️ 시뮬레이션 설정</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              선택한 모든 기간 조건을 동시에 만족하는 종목(AND 교집합)만 표시됩니다.
            </Typography>
          </Box>
          <Button
            variant="contained" color="warning"
            onClick={runSimulation}
            disabled={isSimulating || simPeriods.length === 0}
            startIcon={isSimulating ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ fontWeight: 800, px: 3, py: 1.2, borderRadius: 1.5, whiteSpace: 'nowrap' }}
          >
            {isSimulating ? '시뮬레이션 중...' : '📊 전체 종목 시뮬레이션'}
          </Button>
        </Stack>

        <Divider />

        {/* 시장 + 기간 */}
        <Grid container spacing={3} alignItems="flex-start">
          <Grid size={{ xs: 12, sm: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>🌍 시장</Typography>
            <Stack direction="row" spacing={1}>
              {(['US', 'KR'] as const).map(m => (
                <Chip key={m} label={m === 'US' ? '미국' : '국내'}
                  color={simMarket === m ? 'primary' : 'default'}
                  variant={simMarket === m ? 'filled' : 'outlined'}
                  onClick={() => setSimMarket(m)}
                  sx={{ flex: 1, fontWeight: simMarket === m ? 700 : 500, cursor: 'pointer' }}
                />
              ))}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, sm: 9 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>
              📅 기간
              <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                (AND 교집합 — 복수 선택 시 각 기간 독립 설정)
              </Typography>
            </Typography>
            <Stack direction="row" spacing={1}>
              {PERIOD_OPTIONS.map(({ value, label }) => {
                const active = simPeriods.includes(value);
                return (
                  <Chip key={value} label={label}
                    color={active ? 'info' : 'default'}
                    variant={active ? 'filled' : 'outlined'}
                    onClick={() => togglePeriod(value)}
                    sx={{ flex: 1, fontWeight: active ? 700 : 500, cursor: 'pointer' }}
                  />
                );
              })}
            </Stack>
          </Grid>
        </Grid>

        {/* 기간별 설정 탭 */}
        {simPeriods.length > 1 && (
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ borderBottom: `1px solid ${theme.palette.divider}`, minHeight: 40 }}
          >
            {simPeriods.map(p => (
              <Tab key={p} value={p}
                label={PERIOD_OPTIONS.find(o => o.value === p)?.label ?? p}
                sx={{ fontWeight: activeTab === p ? 800 : 500, minHeight: 40, py: 0.5 }}
              />
            ))}
          </Tabs>
        )}

        {/* 현재 기간의 설정 */}
        {currentConfig ? (
          <PeriodConfigPanel
            period={activeTab}
            config={currentConfig}
            onChange={updates => updatePeriodConfig(activeTab, updates)}
            theme={theme}
          />
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            기간을 선택해주세요.
          </Typography>
        )}

        <Divider />

        {/* 결과 필터 - 돌파 패턴만 */}
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>🔍 결과 필터</Typography>
          <Chip
            label={enablePatternFilter ? `⚡ 터치 후 돌파 패턴 ON` : '터치 후 돌파 패턴 OFF'}
            color={enablePatternFilter ? 'success' : 'default'}
            variant={enablePatternFilter ? 'filled' : 'outlined'}
            onClick={() => setEnablePatternFilter(!enablePatternFilter)}
            sx={{ fontWeight: enablePatternFilter ? 700 : 500, cursor: 'pointer' }}
          />
          {enablePatternFilter && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                최소 터치 횟수:
                <span style={{ color: theme.palette.primary.main, fontWeight: 900, marginLeft: 4 }}>
                  {minTouchesPattern}회
                </span>
              </Typography>
              <Box sx={{ width: 120 }}>
                <input type="range" min={1} max={10} value={minTouchesPattern}
                  onChange={e => setMinTouchesPattern(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: theme.palette.primary.main }}
                />
              </Box>
            </Stack>
          )}
        </Stack>

      </Stack>
    </Card>
  );
}

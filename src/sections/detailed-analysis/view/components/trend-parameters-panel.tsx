'use client';

import type { UseChartTrendSimulatorReturn } from 'src/sections/detailed-analysis/hooks/use-chart-trend-simulator';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import Autocomplete from '@mui/material/Autocomplete';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

// ----------------------------------------------------------------------

interface Props {
  simulator: UseChartTrendSimulatorReturn;
}

export function TrendParametersPanel({ simulator }: Props) {
  const theme = useTheme() as any;

  const {
    selectedTicker,
    setSelectedTicker,
    inputValue,
    setInputValue,
    lookbackDays,
    setLookbackDays,
    stdDevMultiplier,
    setStdDevMultiplier,
    buyMethod,
    setBuyMethod,
    buyAmount,
    setBuyAmount,
    buyShares,
    setBuyShares,
    sellRatio,
    setSellRatio,
    stopLossMargin,
    setStopLossMargin,
    tickerOptions,
  } = simulator;

  return (
    <Card sx={{ p: 3, boxShadow: theme.customShadows?.card }}>
      <Stack spacing={3.5}>
        <Stack spacing={0.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            전략 파라미터
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            회귀 채널 기간, 상/하단선 매매 조건을 설정합니다.
          </Typography>
        </Stack>

        <Autocomplete
          fullWidth
          options={tickerOptions}
          getOptionLabel={(option) => `${option.name} (${option.ticker})`}
          value={tickerOptions.find((opt) => opt.ticker === selectedTicker) || null}
          onChange={(e, v) => {
            if (v) setSelectedTicker(v.ticker);
          }}
          inputValue={inputValue}
          onInputChange={(e, v) => setInputValue(v)}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.ticker}>
              <Stack>
                <Typography variant="subtitle2">{option.name}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {option.ticker}
                </Typography>
              </Stack>
            </Box>
          )}
          renderInput={(params) => (
            <TextField {...params} label="종목 검색 및 설정" placeholder="티커 또는 회사명 검색..." />
          )}
        />

        <Stack spacing={1}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}
          >
            <span>과거 회귀 기간 (일)</span>
            <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
              최근 {lookbackDays}일
            </Typography>
          </Typography>
          <Slider
            min={20}
            max={500}
            step={10}
            value={lookbackDays}
            onChange={(e, val) => setLookbackDays(val as number)}
            valueLabelDisplay="auto"
          />
        </Stack>

        <Stack spacing={1}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}
          >
            <span>채널 폭 (표준편차 배수)</span>
            <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
              ±{stdDevMultiplier.toFixed(1)}σ
            </Typography>
          </Typography>
          <Slider
            min={0.5}
            max={4.0}
            step={0.1}
            value={stdDevMultiplier}
            onChange={(e, val) => setStdDevMultiplier(val as number)}
            valueLabelDisplay="auto"
          />
        </Stack>

        <Stack spacing={2}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            하단 터치 시 매수 옵션
          </Typography>
          <ToggleButtonGroup
            fullWidth
            size="small"
            value={buyMethod}
            exclusive
            onChange={(e, val) => {
              if (val !== null) setBuyMethod(val);
            }}
            color="primary"
          >
            <ToggleButton value="allIn" sx={{ fontWeight: 700 }}>
              전액 매수
            </ToggleButton>
            <ToggleButton value="amount" sx={{ fontWeight: 700 }}>
              고정 금액
            </ToggleButton>
            <ToggleButton value="shares" sx={{ fontWeight: 700 }}>
              고정 주식수
            </ToggleButton>
          </ToggleButtonGroup>

          {buyMethod === 'amount' && (
            <TextField
              fullWidth
              size="small"
              label="회당 추가 매수 금액 ($/₩)"
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(Math.max(1, Number(e.target.value)))}
            />
          )}

          {buyMethod === 'shares' && (
            <TextField
              fullWidth
              size="small"
              label="회당 추가 매수 수량 (주)"
              type="number"
              value={buyShares}
              onChange={(e) => setBuyShares(Math.max(1, Number(e.target.value)))}
            />
          )}
        </Stack>

        <Stack spacing={1}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}
          >
            <span>상단 터치 시 매도 비율</span>
            <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 800 }}>
              보유량의 {sellRatio}% 매도
            </Typography>
          </Typography>
          <Slider
            min={10}
            max={100}
            step={10}
            value={sellRatio}
            onChange={(e, val) => setSellRatio(val as number)}
            valueLabelDisplay="auto"
          />
        </Stack>

        <Stack spacing={1}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}
          >
            <span>전량 손절매 마진 (하단 이탈률)</span>
            <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 800 }}>
              하단선 대비 -{stopLossMargin.toFixed(1)}% 이탈
            </Typography>
          </Typography>
          <Slider
            min={0}
            max={15}
            step={0.5}
            value={stopLossMargin}
            onChange={(e, val) => setStopLossMargin(val as number)}
            valueLabelDisplay="auto"
          />
        </Stack>
      </Stack>
    </Card>
  );
}

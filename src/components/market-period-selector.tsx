'use client';

import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import type { PeriodKey } from 'src/sections/top100/types';

// ----------------------------------------------------------------------

const PERIOD_OPTIONS: { value: PeriodKey | 'custom'; label: string }[] = [
  { value: '3m', label: '3개월' },
  { value: '1y', label: '1년' },
  { value: '2y', label: '2년' },
  { value: '3y', label: '3년' },
  { value: 'custom', label: '직접입력' },
];

interface MarketPeriodSelectorProps {
  market: 'US' | 'KR';
  period: PeriodKey | 'custom';
  startDate?: string;
  endDate?: string;
  onMarketChange: (market: 'US' | 'KR') => void;
  onPeriodChange: (period: PeriodKey | 'custom') => void;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
}

export function MarketPeriodSelector({
  market,
  period,
  startDate,
  endDate,
  onMarketChange,
  onPeriodChange,
  onStartDateChange,
  onEndDateChange,
}: MarketPeriodSelectorProps) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      alignSelf={{ xs: 'stretch', md: 'auto' }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <ToggleButtonGroup
          value={market}
          exclusive
          onChange={(e, v) => v && onMarketChange(v)}
          color="primary"
          size="medium"
        >
          <ToggleButton value="US" sx={{ px: 3, fontWeight: 800 }}>
            US 미국
          </ToggleButton>
          <ToggleButton value="KR" sx={{ px: 3, fontWeight: 800 }}>
            KR 한국
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(e, v) => v && onPeriodChange(v as any)}
          size="medium"
          color="primary"
        >
          {PERIOD_OPTIONS.map((option) => (
            <ToggleButton key={option.value} value={option.value} sx={{ px: 2, fontWeight: 700 }}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {period === 'custom' && (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            type="date"
            label="시작일"
            value={startDate || ''}
            onChange={(e) => onStartDateChange?.(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 140 }}
          />
          <Typography variant="body2" sx={{ color: 'text.secondary', px: 0.5 }}>
            ~
          </Typography>
          <TextField
            size="small"
            type="date"
            label="종료일"
            value={endDate || ''}
            onChange={(e) => onEndDateChange?.(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 140 }}
          />
        </Stack>
      )}
    </Stack>
  );
}


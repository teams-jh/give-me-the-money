'use client';

import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

import type { PeriodKey } from 'src/sections/top100/types';

// ----------------------------------------------------------------------

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '3m', label: '3개월' },
  { value: '1y', label: '1년' },
  { value: '2y', label: '2년' },
  { value: '3y', label: '3년' },
];

interface MarketPeriodSelectorProps {
  market: 'US' | 'KR';
  period: PeriodKey;
  onMarketChange: (market: 'US' | 'KR') => void;
  onPeriodChange: (period: PeriodKey) => void;
}

export function MarketPeriodSelector({
  market,
  period,
  onMarketChange,
  onPeriodChange,
}: MarketPeriodSelectorProps) {
  return (
    <Stack direction="row" spacing={2} alignItems="center" alignSelf={{ xs: 'stretch', md: 'auto' }}>
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
        onChange={(e, v) => v && onPeriodChange(v)}
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
  );
}

'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import { alpha, useTheme } from '@mui/material/styles';

export interface TickerOption {
  ticker: string;
  name: string;
}

interface TickerSelectionCardProps {
  market: 'US' | 'KR';
  tickerOptions: TickerOption[];
  selectedStockMeta: { ticker: string; name: string; industry: string } | null;
  techAnalysis: { currentPrice: number; dailyChange: number; dailyChangePct: number } | null;
  handleTickerChange: (newValue: TickerOption | null) => void;
  formatMoney: (val: number) => string;
}

export function TickerSelectionCard({
  market,
  tickerOptions,
  selectedStockMeta,
  techAnalysis,
  handleTickerChange,
  formatMoney,
}: TickerSelectionCardProps) {
  const theme = useTheme();

  return (
    <Card sx={{ p: 3, boxShadow: theme.customShadows?.card || `0 4px 16px 0 ${alpha(theme.palette.common.black, 0.04)}` }}>
      <Grid container spacing={3} alignItems="center">
        <Grid size={{ xs: 12, md: 7 }}>
          <Autocomplete
            fullWidth
            selectOnFocus
            clearOnBlur
            handleHomeEndKeys
            options={tickerOptions}
            getOptionLabel={(option) => `${option.name} (${option.ticker})`}
            value={selectedStockMeta ? { ticker: selectedStockMeta.ticker, name: selectedStockMeta.name } : null}
            onChange={(e, v) => handleTickerChange(v)}
            filterOptions={(options, state) => {
              const query = state.inputValue.toLowerCase().trim();
              if (!query) return options;

              if (
                selectedStockMeta &&
                `${selectedStockMeta.name} (${selectedStockMeta.ticker})`.toLowerCase() === query
              ) {
                return options;
              }

              return options.filter(
                (opt) =>
                  opt.ticker.toLowerCase().includes(query) ||
                  opt.name.toLowerCase().includes(query)
              );
            }}
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
              <TextField
                {...params}
                label={market === 'US' ? '미국 분석 종목 선택' : '한국 분석 종목 선택'}
                placeholder="티커 또는 회사명 검색..."
              />
            )}
          />
        </Grid>

        {selectedStockMeta && techAnalysis && (
          <Grid size={{ xs: 12, md: 5 }} sx={{ minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
              sx={{ minWidth: 0 }}
            >
              <Box sx={{ minWidth: 0, flexShrink: 1 }}>
                <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 800, display: 'block' }}>
                  현재 선택된 종목
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Chip
                    label={selectedStockMeta.ticker}
                    color="primary"
                    variant="soft"
                    sx={{ fontWeight: 800, flexShrink: 0 }}
                  />
                  <Typography
                    variant="subtitle1"
                    noWrap
                    sx={{ fontWeight: 800 }}
                    title={selectedStockMeta.name}
                  >
                    {selectedStockMeta.name}
                  </Typography>
                </Stack>
              </Box>

              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}>
                  {formatMoney(techAnalysis.currentPrice)}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: techAnalysis.dailyChange >= 0 ? 'error.main' : 'success.main',
                    whiteSpace: 'nowrap',
                    display: 'block',
                  }}
                >
                  {techAnalysis.dailyChange >= 0 ? '▲' : '▼'}{' '}
                  {formatMoney(Math.abs(techAnalysis.dailyChange))} ({techAnalysis.dailyChangePct.toFixed(2)}%)
                </Typography>
              </Box>
            </Stack>
          </Grid>
        )}
      </Grid>
    </Card>
  );
}

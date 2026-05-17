'use client';

import ChartApex from 'react-apexcharts';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

interface TechnicalApexChartProps {
  selectedStockMetaName: string;
  period: string;
  chartOptions: any;
  chartSeries: any[];
}

export function TechnicalApexChart({
  selectedStockMetaName,
  period,
  chartOptions,
  chartSeries,
}: TechnicalApexChartProps) {
  const theme = useTheme();

  return (
    <Grid size={{ xs: 12, lg: 8 }}>
      <Card sx={{ p: 3, height: 600, boxShadow: theme.customShadows?.card }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {selectedStockMetaName} 주가 및 지표 추이 ({period.toUpperCase()})
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
            실선: 주가 | 점선: 볼린저 밴드 & SMA 20
          </Typography>
        </Stack>

        <Box sx={{ height: 500 }}>
          <ChartApex
            options={chartOptions}
            series={chartSeries}
            type="line"
            height="100%"
          />
        </Box>
      </Card>
    </Grid>
  );
}

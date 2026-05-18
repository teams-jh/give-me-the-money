import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import { PeriodData } from './types';

// ----------------------------------------------------------------------

export function getTrendColor(trend: string, theme: any) {
  switch (trend.toLowerCase()) {
    case 'bullish':
      return theme.palette.success.main;
    case 'bearish':
      return theme.palette.error.main;
    case 'recovering':
      return theme.palette.primary.main;
    case 'sideways':
      return theme.palette.warning.main;
    default:
      return theme.palette.text.secondary;
  }
}

export function getTrendLabel(trend: string) {
  switch (trend.toLowerCase()) {
    case 'bullish': return '강세 (Bullish)';
    case 'bearish': return '약세 (Bearish)';
    case 'recovering': return '반등 (Recovering)';
    case 'sideways': return '횡보 (Sideways)';
    default: return trend.toUpperCase();
  }
}

// ----------------------------------------------------------------------

export function BigChart({ data, color }: { data: PeriodData, color: string }) {
  const theme = useTheme();
  if (!data || !data.chart_data.length) return null;

  const min = Math.min(...data.chart_data, ...data.regression);
  const max = Math.max(...data.chart_data, ...data.regression);
  const range = max - min === 0 ? 1 : max - min;
  
  const width = 500;
  const height = 250;

  const getPoints = (points: number[]) => points.map((val, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(v => (
          <line key={v} x1="0" y1={height * v} x2={width} y2={height * v} stroke={theme.palette.divider} strokeWidth="1" strokeDasharray="4 4" />
        ))}
        
        {/* Area fill */}
        <polyline
          fill={alpha(color, 0.1)}
          points={`${width},${height} 0,${height} ${getPoints(data.chart_data)}`}
        />
        
        {/* Regression Line */}
        <polyline
          fill="none"
          stroke={theme.palette.text.disabled}
          strokeWidth="2"
          strokeDasharray="5 5"
          points={getPoints(data.regression)}
        />

        {/* Price Line */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={getPoints(data.chart_data)}
        />
      </svg>
    </Box>
  );
}

// ----------------------------------------------------------------------

export function Sparkline({ data, regression, color }: { data: number[]; regression: number[]; color: string }) {
  const theme = useTheme();
  if (!data || data.length === 0) return null;

  const all = [...data, ...regression];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min === 0 ? 1 : max - min;
  const width = 120;
  const height = 32;

  const getPoints = (points: number[]) => points.map((val, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <Box sx={{ width, height, display: 'flex', alignItems: 'center' }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline
          fill="none"
          stroke={theme.palette.text.disabled}
          strokeWidth="1"
          strokeDasharray="2 2"
          points={getPoints(regression)}
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={getPoints(data)}
        />
      </svg>
    </Box>
  );
}

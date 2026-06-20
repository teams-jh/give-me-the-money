import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

// ----------------------------------------------------------------------

interface DiagnosticCardProps {
  title: string;
  label: string;
  status: 'Bullish' | 'Bearish' | 'Neutral';
  desc: string;
  value: string;
}

export function DiagnosticCard({ title, label, status, desc, value }: DiagnosticCardProps) {
  const theme = useTheme();

  const getStatusColor = () => {
    if (status === 'Bullish') return theme.palette.success.main;
    if (status === 'Bearish') return theme.palette.error.main;
    return theme.palette.warning.main;
  };

  const activeColor = getStatusColor();

  return (
    <Card
      sx={{
        p: 2.5,
        border: `1px solid ${theme.palette.divider}`,
        transition: 'border-color 0.2s',
        '&:hover': {
          borderColor: activeColor,
        },
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 800 }}>
            {title}
          </Typography>
          <Chip
            label={value}
            size="small"
            variant="soft"
            sx={{ fontWeight: 800, fontSize: '0.72rem' }}
          />
        </Stack>

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: activeColor, mb: 0.5 }}>
            {label}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', fontSize: '0.82rem', lineHeight: 1.4 }}
          >
            {desc}
          </Typography>
        </Box>
      </Stack>
    </Card>
  );
}

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';

import { ScreenerItem, ScreenerSubTab } from './types';

// ----------------------------------------------------------------------

interface Props {
  item: ScreenerItem;
  type: ScreenerSubTab;
}

export function ScreenerCard({ item, type }: Props) {
  const theme = useTheme();
  
  const isInc = type === 'inclusion';
  const tagColor = isInc 
    ? (item.zone === 'green' ? theme.palette.success.main : theme.palette.warning.main)
    : (item.risk_level === 'high' ? theme.palette.error.main : item.risk_level === 'medium' ? theme.palette.warning.main : theme.palette.info.main);
  
  const tagLabel = isInc 
    ? (item.zone === 'green' ? '🟢 Safe' : '🟡 Watch')
    : (item.risk_level === 'high' ? '🔴 High' : item.risk_level === 'medium' ? '🟠 Medium' : '🟡 Low');

  const flags = isInc ? item.passed : item.signals;

  return (
    <Card 
      sx={{ 
        p: 2, 
        cursor: 'default',
        transition: theme.transitions.create(['box-shadow', 'transform']),
        '&:hover': {
          boxShadow: (t) => t.customShadows?.z12 || t.shadows[12],
          transform: 'translateY(-4px)'
        }
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{item.ticker}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13 }} noWrap>{item.name}</Typography>
          </Box>
          <Chip 
            label={tagLabel} 
            size="small" 
            sx={{ 
              height: 20, 
              fontSize: 10, 
              fontWeight: 700,
              bgcolor: alpha(tagColor, 0.1),
              color: tagColor,
              border: `1px solid ${alpha(tagColor, 0.2)}`
            }} 
          />
        </Stack>
 
        <Stack direction="row" spacing={1} sx={{ color: 'text.secondary', fontSize: 12 }}>
          <Box component="span">💰 {item.market_cap_b}B</Box>
          <Box component="span">🏭 {item.sector}</Box>
          {isInc && item.float_ratio != null && (
            <Box component="span">유통 {Math.round(item.float_ratio * 100)}%</Box>
          )}
          {!isInc && item.prof_qtrs != null && (
            <Box component="span">흑자 {item.prof_qtrs}/4</Box>
          )}
        </Stack>
 
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {flags?.slice(0, 3).map((sig: string, idx: number) => (
            <Chip 
              key={idx} 
              label={sig} 
              size="small" 
              variant="outlined"
              sx={{ height: 18, fontSize: 9, color: 'text.secondary' }} 
            />
          ))}
          {flags && flags.length > 3 && (
            <Typography variant="caption" sx={{ color: 'text.disabled', ml: 0.5 }}>...</Typography>
          )}
        </Box>
      </Stack>
    </Card>
  );
}

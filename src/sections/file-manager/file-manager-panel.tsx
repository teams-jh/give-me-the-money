import type { BoxProps } from '@mui/material/Box';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';

import { RouterLink } from 'src/routes/components';

import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

// ----------------------------------------------------------------------

type Props = BoxProps & {
  title: string;
  link?: string;
  subtitle?: string;
  collapse?: boolean;
  onOpen?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCollapse?: () => void;
};

export function FileManagerPanel({
  sx,
  link,
  title,
  onOpen,
  subtitle,
  collapse,
  onCollapse,
  ...other
}: Props) {
  return (
    <Box
      sx={[
        {
          mb: 3,
          display: 'flex',
          alignItems: 'center',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...other}
    >
      <Box sx={{ flex: '1 1 auto' }}>
        <Box
          sx={{
            gap: 1,
            display: 'flex',
            typography: 'h6',
            alignItems: 'center',
          }}
        >
          {title}

          <IconButton
            size="small"
            color="primary"
            onClick={onOpen}
            sx={{
              width: 24,
              height: 24,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            <AddIcon sx={{ width: 16, height: 16 }} />
          </IconButton>
        </Box>

        {subtitle && (
          <Box sx={{ typography: 'body2', color: 'text.disabled', mt: 0.5 }}>{subtitle}</Box>
        )}
      </Box>

      {link && (
        <Button
          href={link}
          component={RouterLink}
          size="small"
          color="inherit"
          endIcon={<ArrowForwardIosIcon sx={{ width: 18, height: 18, ml: -0.5 }} />}
        >
          View all
        </Button>
      )}

      {onCollapse && (
        <IconButton onClick={onCollapse}>
          {collapse ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
        </IconButton>
      )}
    </Box>
  );
}

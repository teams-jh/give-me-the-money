'use client';

import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

type Props = {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
  slotProps?: {
    content?: {
      sx?: SxProps<Theme>;
      compact?: boolean;
    };
  };
};

export function SimpleLayout({ children, sx, slotProps }: Props) {
  return (
    <Box
      component="main"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        py: 12,
        ...sx,
      }}
    >
      <Box
        sx={{
          px: 3,
          mx: 'auto',
          maxWidth: slotProps?.content?.compact ? 480 : 'none',
          ...slotProps?.content?.sx,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

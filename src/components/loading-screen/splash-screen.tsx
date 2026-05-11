'use client';

import type { Theme, SxProps } from '@mui/material/styles';
import { Fragment } from 'react';
import Box from '@mui/material/Box';

import Portal from '@mui/material/Portal';
import { styled } from '@mui/material/styles';

import { Logo } from 'src/components/logo';

// ----------------------------------------------------------------------

export type SplashScreenProps = React.ComponentProps<'div'> & {
  portal?: boolean;
  sx?: SxProps<Theme>;
  slots?: {
    logo?: React.ReactNode;
  };
  slotProps?: {
    wrapper?: React.ComponentProps<typeof LoadingWrapper>;
  };
};

export function SplashScreen({ portal = true, slots, slotProps, sx, ...other }: SplashScreenProps) {
  const PortalWrapper = portal ? Portal : Fragment;

  return (
    <PortalWrapper>
      <LoadingWrapper {...slotProps?.wrapper}>
        <LoadingContent sx={sx} {...other}>
          {slots?.logo ?? (
            <Box
              sx={{
                width: 64,
                height: 64,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'pulse 2s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                  '50%': { opacity: 0.48, transform: 'scale(1.1)' },
                },
              }}
            >
              <Logo disabled sx={{ width: 64, height: 64 }} />
            </Box>
          )}
        </LoadingContent>
      </LoadingWrapper>
    </PortalWrapper>
  );
}

// ----------------------------------------------------------------------

const LoadingWrapper = styled('div')({
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
});

const LoadingContent = styled('div')(({ theme }) => ({
  right: 0,
  bottom: 0,
  zIndex: 9998,
  flexGrow: 1,
  width: '100%',
  height: '100%',
  display: 'flex',
  position: 'fixed',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.vars.palette.background.default,
}));

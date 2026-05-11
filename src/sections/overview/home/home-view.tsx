'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { varAlpha } from 'minimal-shared/utils';

import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

export function DashboardHomeView() {
  return (
    <DashboardContent maxWidth="xl">
      <Typography variant="h4" sx={{ mb: { xs: 3, md: 5 } }}>
        Hi, Welcome back 👋
      </Typography>

      <Box
        sx={(theme) => ({
          height: 400,
          display: 'flex',
          borderRadius: 2,
          textAlign: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          justifyContent: 'center',
          border: `dashed 1px ${theme.vars.palette.divider}`,
          bgcolor: varAlpha(theme.vars.palette.grey['500Channel'], 0.04),
        })}
      >
        <Typography variant="h5" sx={{ mb: 1 }}>
          Home Page Under Construction
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          We are currently working on something awesome. Stay tuned!
        </Typography>
      </Box>
    </DashboardContent>
  );
}

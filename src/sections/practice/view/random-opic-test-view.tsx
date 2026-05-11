'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { DashboardContent } from 'src/layouts/dashboard';

// ----------------------------------------------------------------------

export function RandomOpicTestView() {
  return (
    <DashboardContent>
      <Typography variant="h4" sx={{ mb: { xs: 3, md: 5 } }}>
        랜덤 모의고사
      </Typography>

      <Box
        sx={{
          mt: 5,
          width: 1,
          height: 320,
          borderRadius: 2,
          bgcolor: (theme) => theme.vars.palette.background.neutral,
          border: (theme) => `dashed 1px ${theme.vars.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Random OPIc Test Content Goes Here
        </Typography>
      </Box>
    </DashboardContent>
  );
}

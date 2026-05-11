'use client';

import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import { RouterLink } from 'src/routes/components';

import { SimpleLayout } from 'src/layouts/simple';

// ----------------------------------------------------------------------

export function View403() {
  return (
    <SimpleLayout
      slotProps={{
        content: { compact: true },
      }}
    >
      <Container>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h3" sx={{ mb: 2 }}>
            No permission
          </Typography>

          <Typography sx={{ color: 'text.secondary' }}>
            The page you’re trying to access has restricted access. Please refer to your system
            administrator.
          </Typography>

          <Box sx={{ my: { xs: 5, sm: 10 }, height: 260 }} />

          <Button component={RouterLink} href="/" size="large" variant="contained">
            Go to home
          </Button>
        </Box>
      </Container>
    </SimpleLayout>
  );
}

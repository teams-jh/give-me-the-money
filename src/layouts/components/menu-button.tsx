import type { IconButtonProps } from '@mui/material/IconButton';

import MenuIcon from '@mui/icons-material/Menu';
import IconButton from '@mui/material/IconButton';

// ----------------------------------------------------------------------

export function MenuButton({ sx, ...other }: IconButtonProps) {
  return (
    <IconButton sx={sx} {...other}>
      <MenuIcon />
    </IconButton>
  );
}

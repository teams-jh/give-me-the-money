import type { BoxProps } from '@mui/material/Box';

import { memo } from 'react';
import Box from '@mui/material/Box';
import Portal from '@mui/material/Portal';
import Checkbox from '@mui/material/Checkbox';

import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';

// ----------------------------------------------------------------------

type Props = BoxProps & {
  rowCount: number;
  numSelected: number;
  selected?: string[];
  action?: React.ReactNode;
  onSelectAllItems: (checked: boolean) => void;
};

export const FileManagerActionSelected = memo(({
  sx,
  action,
  selected,
  rowCount,
  numSelected,
  onSelectAllItems,
  ...other
}: Props) => {
  return (
    <Portal>
      <Box
        sx={[
          (theme) => ({
            right: 0,
            zIndex: 9,
            bottom: 0,
            display: 'flex',
            borderRadius: 1.5,
            position: 'fixed',
            alignItems: 'center',
            bgcolor: 'text.primary',
            p: theme.spacing(1.5, 2, 1.5, 1),
            boxShadow: theme.vars.customShadows.z20,
            m: { xs: 2, md: 3 },
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        {...other}
      >
        <Checkbox
          indeterminate={!!numSelected && numSelected < rowCount}
          checked={!!rowCount && numSelected === rowCount}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            onSelectAllItems(event.target.checked)
          }
          icon={<RadioButtonUncheckedIcon sx={{ width: 22, height: 22 }} />}
          checkedIcon={<CheckCircleIcon sx={{ width: 22, height: 22 }} />}
          indeterminateIcon={<IndeterminateCheckBoxIcon sx={{ width: 22, height: 22 }} />}
          slotProps={{
            input: { id: 'items-selected-checkbox' },
          }}
        />

        {selected && (
          <Box
            component="span"
            sx={[
              (theme) => ({
                mr: 2,
                minWidth: 128,
                color: 'common.white',
                typography: 'subtitle2',
                ...theme.applyStyles('dark', {
                  color: 'grey.800',
                }),
              }),
            ]}
          >
            {selected.length} items selected
          </Box>
        )}

        {action && action}
      </Box>
    </Portal>
  );
});

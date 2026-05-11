import type { UseSetStateReturn } from 'minimal-shared/hooks';
import type { IFileFilters } from 'src/types/file';
import type { IDatePickerControl } from 'src/types/common';

import { useState, useEffect, useCallback } from 'react';
import { varAlpha } from 'minimal-shared/utils';
import { usePopover } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CardActionArea from '@mui/material/CardActionArea';
import InputAdornment from '@mui/material/InputAdornment';

import SearchIcon from '@mui/icons-material/Search';

// ----------------------------------------------------------------------

type Props = {
  onResetPage: () => void;
  filters: UseSetStateReturn<IFileFilters>;
};

export function FileManagerFilters({
  filters,
  onResetPage,
}: Props) {
  const { state: currentFilters, setState: updateFilters } = filters;

  const [searchValue, setSearchValue] = useState(currentFilters.name);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchValue !== currentFilters.name) {
        onResetPage();
        updateFilters({ name: searchValue });
      }
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [searchValue, currentFilters.name, onResetPage, updateFilters]);

  const handleFilterName = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value);
  }, []);


  const renderFilterName = () => (
    <TextField
      value={searchValue}
      onChange={handleFilterName}
      placeholder="Search..."
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'text.disabled' }} />
            </InputAdornment>
          ),
        },
      }}
      sx={{ width: { xs: 1, md: 260 } }}
    />
  );


  return (
    <Box
      sx={{
        gap: 1,
        width: 1,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { xs: 'flex-end', md: 'center' },
      }}
    >
      {renderFilterName()}
    </Box>
  );
}

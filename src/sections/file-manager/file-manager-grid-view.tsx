import type { IFile } from 'src/types/file';
import type { UseTableReturn } from 'src/components/table';

import { useBoolean, usePopover } from 'minimal-shared/hooks';
import { useRef, useState, useCallback, useMemo } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';

import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import DeleteIcon from '@mui/icons-material/Delete';

import { CustomPopover } from 'src/components/custom-popover';

import { FileManagerPanel } from './file-manager-panel';
import { FileManagerFileItem } from './file-manager-file-item';
import { FileManagerFolderItem } from './file-manager-folder-item';
import { FileManagerActionSelected } from './file-manager-action-selected';
import { EmptyContent } from 'src/components/empty-content';
import { FileManagerCreateFolderDialog } from './file-manager-create-folder-dialog';

// ----------------------------------------------------------------------

const INVALID_CHARACTERS = /[<>:"/\\|?*]/;

// ----------------------------------------------------------------------

type Props = {
  table: UseTableReturn;
  dataFiltered: IFile[];
  onOpenConfirm: () => void;
  onDeleteItem: (id: string) => void;

  onNavigate: (id: string | null) => void;
  onOpenFile?: (id: string) => void;
  onFavoriteItem?: (id: string) => void;
  onCreateItem?: (name: string, type: 'folder' | 'file') => void;
  onOpenRename?: (id: string) => void;
  onCopyItem?: (id: string) => void;
  onMoveItem?: (sourceId: string, targetFolderId: string | null) => void;
  notFound?: boolean;
  hideFolder?: boolean;
};

export function FileManagerGridView({
  table,
  dataFiltered,
  onDeleteItem,
  onOpenConfirm,
  onNavigate,
  onOpenFile,
  onFavoriteItem,
  onCreateItem,
  onOpenRename,
  onCopyItem,
  onMoveItem,
  notFound,
  hideFolder,
}: Props) {
  const { selected, onSelectRow: onSelectItem, onSelectAllRows: onSelectAllItems } = table;

  const containerRef = useRef(null);

  const newFilesDialog = useBoolean();

  const newFolderDialog = useBoolean();

  const menuActions = usePopover();

  const [createType, setCreateType] = useState<'folder' | 'file'>(hideFolder ? 'file' : 'folder');

  const sortedData = useMemo(() => {
    return [...dataFiltered].sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;

      if (a.isFavorited && !b.isFavorited) return -1;
      if (!a.isFavorited && b.isFavorited) return 1;

      return a.name.localeCompare(b.name);
    });
  }, [dataFiltered]);

  const renderUploadFilesDialog = () => (
    <FileManagerCreateFolderDialog open={newFilesDialog.value} onClose={newFilesDialog.onFalse} />
  );

  const renderCreateFolderDialog = () => (
    <FileManagerCreateFolderDialog
      open={newFolderDialog.value}
      onClose={newFolderDialog.onFalse}
      title={createType === 'folder' ? 'New folder' : 'New file'}
      onCreate={(name) => {
        newFolderDialog.onFalse();
        onCreateItem?.(name, createType);
      }}
      existingItems={dataFiltered}
      currentType={createType}
      textFieldProps={{
        label: createType === 'folder' ? 'Folder name' : 'File name',
      }}
      hideUpload
    />
  );

  const renderMenuActions = () => (
    <CustomPopover
      open={menuActions.open}
      anchorEl={menuActions.anchorEl}
      onClose={menuActions.onClose}
      slotProps={{ arrow: { placement: 'top-center' } }}
    >
      <MenuList>
        {!hideFolder && (
          <MenuItem
            onClick={() => {
              setCreateType('folder');
              newFolderDialog.onTrue();
              menuActions.onClose();
            }}
          >
            <CreateNewFolderIcon sx={{ mr: 1 }} />
            New folder
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            setCreateType('file');
            newFolderDialog.onTrue();
            menuActions.onClose();
          }}
        >
          <NoteAddIcon sx={{ mr: 1 }} />
          New file
        </MenuItem>
      </MenuList>
    </CustomPopover>
  );

  const renderSelectedActions = () => {
    const selectedItems = dataFiltered.filter((item) => selected.includes(item.id));
    const hasNonEmptyFolder = selectedItems.some(
      (item) => item.type === 'folder' && (item as any).totalFiles > 0
    );

    return (
      !!selected?.length && (
        <FileManagerActionSelected
          numSelected={selected.length}
          rowCount={dataFiltered.length}
          selected={selected}
          onSelectAllItems={(checked) =>
            onSelectAllItems(
              checked,
              dataFiltered.map((row) => row.id)
            )
          }
          action={
            <>
              <Button
                size="small"
                color="error"
                variant="contained"
                startIcon={<DeleteIcon />}
                onClick={onOpenConfirm}
                sx={{ mr: 1 }}
              >
                Delete
              </Button>
            </>
          }
        />
      )
    );
  };

  return (
    <>
      <Box ref={containerRef}>
        <FileManagerPanel
          title="All files"
          subtitle={`${dataFiltered.length} items`}
          onOpen={menuActions.onOpen}
        />

        {notFound && <EmptyContent filled sx={{ py: 10 }} />}

        <Box
          sx={{
            gap: 3,
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(1, 1fr)',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
          }}
        >
          {sortedData.map((item) =>
            item.type === 'folder' ? (
              <FileManagerFolderItem
                key={item.id}
                folder={item}
                selected={selected.includes(item.id)}
                onSelect={() => onSelectItem(item.id)}
                onDelete={() => onDeleteItem(item.id)}
                onEdit={() => onOpenRename?.(item.id)}
                onCopy={() => onCopyItem?.(item.id)}
                onNavigate={() => onNavigate(item.id)}
                onFavorite={() => onFavoriteItem?.(item.id)}
              />
            ) : (
              <FileManagerFileItem
                key={item.id}
                file={item}
                selected={selected.includes(item.id)}
                onSelect={() => onSelectItem(item.id)}
                onDelete={() => onDeleteItem(item.id)}
                onOpenFile={() => onOpenFile?.(item.id)}
                onFavorite={() => onFavoriteItem?.(item.id)}
                onEdit={() => onOpenRename?.(item.id)}
                onCopy={() => onCopyItem?.(item.id)}
              />
            )
          )}
        </Box>

        {renderSelectedActions()}
      </Box>

      {renderUploadFilesDialog()}
      {renderCreateFolderDialog()}
      {renderMenuActions()}
    </>
  );
}



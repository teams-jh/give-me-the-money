import type { IFileManager } from 'src/types/file';
import type { FileItemProps } from './file-manager-file-item-slots';

import { memo, useState, useCallback, useEffect } from 'react';
import { useBoolean, usePopover } from 'minimal-shared/hooks';
import { useDraggable } from '@dnd-kit/core';

import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';

import { fData } from 'src/utils/format-number';
import { fDateTime } from 'src/utils/format-time';

import { getIsMobile } from 'src/utils/is-mobile';

import { toast } from 'src/components/snackbar';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';

import { ConfirmDialog } from 'src/components/custom-dialog';
import { CustomPopover } from 'src/components/custom-popover';

import { FileManagerCreateFolderDialog } from './file-manager-create-folder-dialog';
import {
  FileItem,
  FileItemIcon,
  FileItemInfo,
  FileItemActions,
} from './file-manager-file-item-slots';

// ----------------------------------------------------------------------

type Props = FileItemProps & {
  selected?: boolean;
  file: IFileManager;
  onDelete: () => void;
  onEdit: () => void;
  onCopy?: () => void;
  onSelect?: () => void;
  onOpenFile?: () => void;
  onFavorite?: (id: string) => void;
};

export const FileManagerFileItem = memo(({
  file,
  selected,
  onSelect,
  onDelete,
  onEdit,
  onCopy,
  onOpenFile,
  onFavorite,
  sx,
  ...other
}: Props) => {
  const menuActions = usePopover();

  const checkbox = useBoolean();
  const favorite = useBoolean(file.isFavorited);

  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: file.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 9999,
        opacity: 0.8,
      }
    : undefined;

  useEffect(() => {
    setIsMobileDevice(getIsMobile());
  }, []);

  useEffect(() => {
    if (file.isFavorited !== favorite.value) {
      favorite.setValue(file.isFavorited);
    }
  }, [file.isFavorited, favorite]);

  const handleFavorite = useCallback(() => {
    favorite.onToggle();
    onFavorite?.(file.id);
  }, [favorite, onFavorite, file.id]);

  const handleDoubleClick = useCallback(() => {
    onOpenFile?.();
  }, [onOpenFile]);

  const renderMenuActions = () => (
    <CustomPopover
      open={menuActions.open}
      anchorEl={menuActions.anchorEl}
      onClose={menuActions.onClose}
      slotProps={{ arrow: { placement: 'right-top' } }}
    >
      <MenuList>
        <MenuItem
          onClick={() => {
            menuActions.onClose();
            onOpenFile?.();
          }}
        >
          <VisibilityIcon sx={{ mr: 1, width: 18, height: 18 }} />
          Open
        </MenuItem>

        <MenuItem
          onClick={() => {
            menuActions.onClose();
            onEdit();
          }}
        >
          <EditIcon sx={{ mr: 1, width: 18, height: 18 }} />
          Rename
        </MenuItem>

        <MenuItem
          onClick={() => {
            menuActions.onClose();
            onCopy?.();
          }}
        >
          <ContentCopyIcon sx={{ mr: 1, width: 18, height: 18 }} />
          Copy
        </MenuItem>

        <Divider sx={{ borderStyle: 'dashed' }} />

        <MenuItem
          onClick={() => {
            onDelete();
            menuActions.onClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1, width: 18, height: 18 }} />
          Delete
        </MenuItem>
      </MenuList>
    </CustomPopover>
  );





  return (
    <>
      <FileItem
        ref={setNodeRef}
        variant="outlined"
        selected={selected}
        sx={{ ...sx, ...style }}
        onDoubleClick={handleDoubleClick}
        onClick={isMobileDevice ? handleDoubleClick : undefined}
        {...attributes}
        {...listeners}
        {...other}
      >

        <FileItemIcon
          id={file.id}
          onMouseEnter={checkbox.onTrue}
          onMouseLeave={checkbox.onFalse}
          hovered={checkbox.value}
          checked={selected}
          onChange={onSelect}
          fileType={file.type}
        />

        <FileItemInfo
          type="file"
          title={file.name}
          values={[fDateTime(file.modifiedAt)]}
        />


        <FileItemActions
          id={file.id}
          checked={favorite.value}
          onChange={handleFavorite}
          openMenu={menuActions.open}
          onOpenMenu={menuActions.onOpen}
        />
      </FileItem>

      {renderMenuActions()}
    </>
  );
});

import type { IFolderManager } from 'src/types/file';
import type { FileItemProps } from './file-manager-file-item-slots';

import { memo, useState, useCallback, useEffect } from 'react';
import { useBoolean, usePopover } from 'minimal-shared/hooks';
import { useDraggable, useDroppable } from '@dnd-kit/core';

import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuList from '@mui/material/MenuList';
import MenuItem from '@mui/material/MenuItem';

import { fData } from 'src/utils/format-number';

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
  onDelete: () => void;
  onEdit: () => void;
  onCopy?: () => void;
  onSelect?: () => void;
  onNavigate?: VoidFunction;
  onFavorite?: (id: string) => void;
  folder: IFolderManager;
};

export const FileManagerFolderItem = memo(({
  sx,
  folder,
  selected,
  onSelect,
  onDelete,
  onEdit,
  onCopy,
  onNavigate,
  onFavorite,
  ...other
 }: Props) => {
  const checkbox = useBoolean();
  const favorite = useBoolean(folder.isFavorited);

  const menuActions = usePopover();

  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: folder.id,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: folder.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 9999,
        opacity: 0.8,
      }
    : undefined;

  // Combine refs
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    setDropRef(node);
  };

  useEffect(() => {
    setIsMobileDevice(getIsMobile());
  }, []);

  useEffect(() => {
    if (folder.isFavorited !== favorite.value) {
      favorite.setValue(folder.isFavorited);
    }
  }, [folder.isFavorited, favorite]);

  const handleFavorite = useCallback(() => {
    favorite.onToggle();
    onFavorite?.(folder.id);
  }, [favorite, onFavorite, folder.id]);

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
            onNavigate?.();
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
        ref={setRefs}
        variant="outlined"
        selected={selected}
        onDoubleClick={onNavigate}
        onClick={isMobileDevice ? onNavigate : undefined}
        sx={{
          ...sx,
          ...style,
          cursor: 'pointer',
          ...(isOver && {
            bgcolor: 'action.hover',
            borderStyle: 'dashed',
            borderColor: 'primary.main',
          }),
        }}
        {...attributes}
        {...listeners}
        {...other}
      >

        <FileItemIcon
          id={folder.id}
          onMouseEnter={checkbox.onTrue}
          onMouseLeave={checkbox.onFalse}
          hovered={checkbox.value}
          checked={selected}
          onChange={onSelect}
        />

        <FileItemInfo
          type="folder"
          title={folder.name}
          values={[`${folder.totalFiles} files`]}
        />


        <FileItemActions
          id={folder.id}
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

import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocalStorage } from 'minimal-shared/hooks';
import { useDroppable } from '@dnd-kit/core';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputBase from '@mui/material/InputBase';
import Autocomplete from '@mui/material/Autocomplete';
import ListItemText from '@mui/material/ListItemText';
import InputAdornment from '@mui/material/InputAdornment';
import { TreeItem, treeItemClasses } from '@mui/x-tree-view/TreeItem';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';

import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import StorageIcon from '@mui/icons-material/Storage';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';

// ----------------------------------------------------------------------

// ----------------------------------------------------------------------

const MIN_WIDTH = 120;
const MAX_WIDTH = 480;

const RootStyle = styled(Box, {
  shouldForwardProp: (prop) =>
    !['width', 'isCollapsed', 'isResizing', 'isOpening', 'introFinished'].includes(prop as string),
})<{
  width: number;
  isCollapsed: boolean;
  isResizing: boolean;
  isOpening: boolean;
  introFinished: boolean;
}>(({ width, isCollapsed, isResizing, isOpening, introFinished, theme }) => ({
  height: '100%',
  display: 'flex',
  position: 'relative',
  flexDirection: 'column',
  width: isOpening || isCollapsed ? 0 : width,
  ...(!isResizing && {
    transition: theme.transitions.create(['width'], {
      easing: theme.transitions.easing.sharp,
      duration: introFinished ? theme.transitions.duration.shorter : 800,
    }),
  }),
  borderRight: `solid 1px ${theme.vars.palette.divider}`,
  backgroundColor: theme.vars.palette.background.neutral,
  overflow: 'hidden',
}));

const ResizeHandle = styled(Box)(({ theme }) => ({
  top: 0,
  right: -8,
  bottom: 0,
  width: 16,
  zIndex: 10,
  cursor: 'col-resize',
  position: 'absolute',
  touchAction: 'none',
  '&:hover, &:active': {
    '&::after': {
      backgroundColor: theme.vars.palette.primary.main,
    },
    '&::before': {
      backgroundColor: theme.vars.palette.primary.main,
      opacity: 1,
    },
  },
  // Vertical line
  '&::after': {
    content: '""',
    top: 0,
    left: 7,
    bottom: 0,
    width: 2,
    position: 'absolute',
    backgroundColor: theme.vars.palette.divider,
    transition: theme.transitions.create(['background-color']),
  },
  // Grabbable pill handle
  '&::before': {
    content: '""',
    top: '50%',
    left: 4,
    width: 8,
    height: 48,
    borderRadius: 8,
    position: 'absolute',
    transform: 'translateY(-50%)',
    backgroundColor: theme.vars.palette.text.disabled,
    opacity: 0.3,
    transition: theme.transitions.create(['background-color', 'opacity']),
  },
}));

const StyledTreeItem = styled(TreeItem)(({ theme }) => ({
  color: theme.vars.palette.text.secondary,
  [`& .${treeItemClasses.content}`]: {
    userSelect: 'none',
    paddingRight: theme.spacing(1),
    paddingTop: theme.spacing(0.2),
    paddingBottom: theme.spacing(0.2),
    margin: theme.spacing(0.2, 0),
    minHeight: 28,
    minWidth: 0,
    borderRadius: '6px',
    fontWeight: theme.typography.fontWeightMedium,
    transition: theme.transitions.create(['background-color', 'color'], {
      duration: theme.transitions.duration.shorter,
    }),
    [`& .${treeItemClasses.iconContainer}`]: {
      marginRight: 0,
      width: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      '& svg': {
        width: 14,
        height: 14,
      },
    },
    '&.Mui-expanded': {
      fontWeight: theme.typography.fontWeightRegular,
    },
    '&:hover': {
      backgroundColor: theme.vars.palette.action.hover,
    },
    '&.Mui-focused, &.Mui-selected, &.Mui-selected.Mui-focused': {
      backgroundColor: `var(--tree-view-bg-color, ${theme.vars.palette.action.selected})`,
      color: 'var(--tree-view-color)',
    },
    [`& .${treeItemClasses.label}`]: {
      fontSize: theme.typography.pxToRem(13),
      fontWeight: 'inherit',
      color: 'inherit',
      minWidth: 0,
    },
  },
  [`& .${treeItemClasses.groupTransition}`]: {
    marginLeft: 4,
    paddingLeft: 6,
    borderLeft: `1px solid ${theme.vars.palette.divider}`,
  },
}));

// ----------------------------------------------------------------------

// ----------------------------------------------------------------------

const SidebarTreeItem = memo(
  ({
    node,
    editingId,
    onSelect,
    onOpenFile,
    onSave,
    onCancel,
  }: {
    node: any;
    editingId: string | null;
    onSelect: (id: string) => void;
    onOpenFile?: (id: string) => void;
    onSave: (id: string, name: string) => void;
    onCancel: () => void;
  }) => {
    const isEditing = editingId === node.id;
    const [localValue, setLocalValue] = useState(node.label);

    const inputRef = useRef<HTMLInputElement>(null);

    const { setNodeRef, isOver } = useDroppable({
      id: node.id,
      disabled: node.type !== 'folder',
    });

    // Sync local value when entering editing mode
    useEffect(() => {
      if (isEditing) {
        setLocalValue(node.label);
        // Focus without scrolling
        setTimeout(() => {
          inputRef.current?.focus({ preventScroll: true });
        }, 0);
      }
    }, [isEditing, node.label]);

    const handleBlur = () => {
      if (localValue.trim() && localValue !== node.label) {
        onSave(node.id, localValue.trim());
      } else {
        onCancel();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        handleBlur();
      }
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    return (
      <StyledTreeItem
        itemId={node.id}
        label={
          <Stack
            ref={setNodeRef}
            direction="row"
            alignItems="center"
            spacing={0.3}
            sx={{ py: 0.2, minWidth: 0 }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(node.id);
            }}
          >
            {node.type === 'folder' ? (
              <FolderIcon sx={{ width: 14, height: 14, color: 'warning.main' }} />
            ) : (
              <DescriptionIcon sx={{ width: 14, height: 14, color: 'text.disabled' }} />
            )}
            {isEditing ? (
              <InputBase
                fullWidth
                inputRef={inputRef}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                sx={{
                  typography: 'body2',
                  flexGrow: 1,
                  minWidth: 0,
                  backgroundColor: (theme) => theme.vars.palette.background.paper,
                  borderRadius: 0.5,
                  px: 0.5,
                  userSelect: 'text',
                  '& .MuiInputBase-input': {
                    p: 0,
                    height: '24px',
                    lineHeight: '24px',
                    display: 'flex',
                    alignItems: 'center',
                  },
                }}
              />
            ) : (
              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontSize: 'inherit',
                  fontWeight: 'inherit',
                  flexGrow: 1,
                  minWidth: 0,
                }}
              >
                {node.label}
              </Typography>
            )}
          </Stack>
        }
      >
        {Array.isArray(node.children)
          ? node.children.map((child: any) => (
            <SidebarTreeItem
              key={child.id}
              node={child}
              editingId={editingId}
              onSelect={onSelect}
              onOpenFile={onOpenFile}
              onSave={onSave}
              onCancel={onCancel}
            />
          ))
          : null}
      </StyledTreeItem>
    );
  }
);

const WIDTH_KEY = 'file-manager-sidebar-width';

type Props = {
  data: any[];
  isCollapsed: boolean;
  onToggle: VoidFunction;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onOpenFile?: (id: string) => void;
  onUpdateName?: (id: string, name: string) => void;
};

export function FileManagerSidebar({
  data,
  isCollapsed,
  onToggle,
  selectedId,
  onSelectId,
  onOpenFile,
  onUpdateName,
}: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpening, setIsOpening] = useState(true);
  const [introFinished, setIntroFinished] = useState(false);

  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);

  const scrollbarStyles = {
    '&::-webkit-scrollbar': {
      width: 5,
      height: 5,
    },
    '&::-webkit-scrollbar-track': {
      backgroundColor: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: (theme: any) => theme.vars.palette.divider,
      borderRadius: 10,
    },
    '&::-webkit-scrollbar-thumb:hover': {
      backgroundColor: (theme: any) => theme.vars.palette.text.disabled,
    },
  };

  const { state: width, setState: setWidth } = useLocalStorage(
    WIDTH_KEY,
    typeof window !== 'undefined' && window.innerWidth < 600 ? window.innerWidth / 3 : 280
  );

  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const openTimer = setTimeout(() => setIsOpening(false), 100);
    const finishTimer = setTimeout(() => setIntroFinished(true), 1000);

    return () => {
      clearTimeout(openTimer);
      clearTimeout(finishTimer);
    };
  }, []);

  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;
    },
    [width]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setIsResizing(true);
      startXRef.current = e.touches[0].clientX;
      startWidthRef.current = width;
    },
    [width]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      window.requestAnimationFrame(() => {
        const deltaX = e.clientX - startXRef.current;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + deltaX));
        setWidth(newWidth);
      });
    },
    [isResizing, setWidth]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isResizing) return;

      window.requestAnimationFrame(() => {
        const deltaX = e.touches[0].clientX - startXRef.current;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + deltaX));
        setWidth(newWidth);
      });
    },
    [isResizing, setWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    } else {
      document.body.style.userSelect = 'auto';
      document.body.style.cursor = 'auto';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    }
    return () => {
      document.body.style.userSelect = 'auto';
      document.body.style.cursor = 'auto';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isResizing, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const sortedData = useMemo(() => {
    const sortNodes = (nodes: any[]): any[] => {
      return [...nodes]
        .sort((a, b) => {
          if (a.type === 'folder' && b.type !== 'folder') return -1;
          if (a.type !== 'folder' && b.type === 'folder') return 1;
          return a.label.localeCompare(b.label);
        })
        .map((node) => ({
          ...node,
          children: node.children ? sortNodes(node.children) : undefined,
        }));
    };
    return sortNodes(data);
  }, [data]);

  // Flatten tree for search and include parent lineage
  const flattenedData = useMemo(() => {
    const results: any[] = [];
    const flatten = (nodes: any[], parentPath = '', parents: string[] = []) => {
      nodes.forEach((node) => {
        const currentPath = parentPath ? `${parentPath}/${node.label}` : node.label;
        const currentParents = [...parents];
        results.push({ ...node, path: currentPath, parentIds: currentParents });
        if (node.children) {
          flatten(node.children, currentPath, [...currentParents, node.id]);
        }
      });
    };
    flatten(sortedData);
    return results;
  }, [sortedData]);

  // Effect to expand parents when selectedId changes externally (e.g. from Grid View)
  useEffect(() => {
    if (selectedId) {
      const item = flattenedData.find((f) => f.id === selectedId);
      if (item) {
        setExpandedItems((prev) => {
          const newExpanded = [...new Set([...prev, ...item.parentIds])];
          return newExpanded;
        });
      }
    }
  }, [selectedId, flattenedData]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F2' && selectedId && !editingId) {
        event.preventDefault();
        setEditingId(selectedId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, editingId]);

  const handleCancelEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleSaveEditing = useCallback(
    (id: string, name: string) => {
      onUpdateName?.(id, name);
      setEditingId(null);
    },
    [onUpdateName]
  );

  const handleAutocompleteChange = (event: any, newValue: any) => {
    if (newValue) {
      onSelectId(newValue.id);
    }
  };

  // Use default values until mounted to avoid hydration mismatch
  const displayWidth = isMounted ? width : 280;
  const displayCollapsed = isMounted ? isCollapsed : true;

  // Add droppable for root at sidebar level
  const { setNodeRef: setRootDropRef, isOver: isRootOver } = useDroppable({
    id: 'root',
  });

  return (
    <Box sx={{ position: 'relative', display: 'flex', height: '100%' }}>
      <RootStyle
        width={displayWidth}
        isCollapsed={displayCollapsed}
        isResizing={isResizing}
        isOpening={isOpening}
        introFinished={introFinished}
      >
        <Stack
          spacing={1.5}
          sx={{
            p: 1.5,
            width: displayWidth,
            minWidth: displayWidth,
            opacity: isMounted ? 1 : 0,
            height: '100%',
            transition: (theme) => theme.transitions.create(['opacity']),
          }}
        >
          <Stack
            ref={setRootDropRef}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              userSelect: 'none',
              borderRadius: 0.5,
              p: 0.5,
            }}
          >
            <Typography variant="overline" sx={{ color: 'text.secondary', textTransform: 'none' }}>
              Explorer
            </Typography>
          </Stack>

          <Autocomplete
            fullWidth
            size="small"
            options={flattenedData}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={handleAutocompleteChange}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search..."
                slotProps={{
                  input: {
                    ...params.InputProps,
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: 'text.disabled' }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}
            renderOption={(props, option) => {
              const { key, ...optionProps } = props as any;
              return (
                <li key={option.id} {...optionProps} style={{ ...optionProps.style, overflow: 'hidden' }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ width: 1, minWidth: 0, overflow: 'hidden' }}
                  >
                    {option.type === 'folder' ? (
                      <FolderIcon sx={{ width: 18, height: 18, color: 'warning.main' }} />
                    ) : (
                      <DescriptionIcon sx={{ width: 18, height: 18, color: 'text.disabled' }} />
                    )}
                    <Box sx={{ minWidth: 0, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2" noWrap sx={{ display: 'block', width: 1 }}>
                        {option.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{ display: 'block', width: 1, opacity: 0.6 }}
                      >
                        {option.path}
                      </Typography>
                    </Box>
                  </Stack>
                </li>
              );
            }}
          />

          <Box
            sx={{
              flexGrow: 1,
              px: 1,
              py: 1,
              overflowY: 'auto',
              minHeight: 0,
              ...scrollbarStyles,
            }}
          >
            <SimpleTreeView
              aria-label="file system navigator"
              expandedItems={expandedItems}
              onExpandedItemsChange={(event, items) => setExpandedItems(items)}
              selectedItems={selectedId}
              onSelectedItemsChange={(event, itemId) => onSelectId(itemId)}
              sx={{
                flexGrow: 1,
                overflowY: 'auto',
              }}
            >
              {sortedData.map((node) => (
                <SidebarTreeItem
                  key={node.id}
                  node={node}
                  editingId={editingId}
                  onSelect={onSelectId}
                  onOpenFile={onOpenFile}
                  onSave={handleSaveEditing}
                  onCancel={handleCancelEditing}
                />
              ))}
            </SimpleTreeView>
          </Box>
        </Stack>

        {!displayCollapsed && (
          <ResizeHandle onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} />
        )}
      </RootStyle>

      <IconButton
        onClick={onToggle}
        sx={{
          display: { xs: 'none', md: 'inline-flex' },
          p: 0.5,
          top: 12,
          left: displayCollapsed ? 4 : displayWidth - 16,
          zIndex: 11,
          width: 32,
          height: 32,
          position: 'absolute',
          bgcolor: 'background.paper',
          border: (theme) => `solid 1px ${theme.vars.palette.divider}`,
          '&:hover': { bgcolor: 'background.neutral' },
          transition: (theme) => theme.transitions.create(['left', 'opacity']),
          opacity: isMounted && !isResizing ? 1 : 0,
        }}
      >
        {displayCollapsed ? <ArrowForwardIosIcon sx={{ width: 16, height: 16 }} /> : <ArrowBackIosIcon sx={{ width: 16, height: 16 }} />}
      </IconButton>

      {isMounted && document.getElementById('file-manager-sidebar-portal') && createPortal(
        <IconButton
          onClick={onToggle}
          sx={{
            display: { xs: 'inline-flex', md: 'none' },
            p: 0.5,
            width: 32,
            height: 32,
          }}
        >
          <ViewSidebarIcon sx={{ width: 24, height: 24 }} />
        </IconButton>,
        document.getElementById('file-manager-sidebar-portal')!
      )}
    </Box>
  );
}

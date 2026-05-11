'use client';

import type { IFile, IFileFilters } from 'src/types/file';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useBoolean, useSetState, useLocalStorage } from 'minimal-shared/hooks';
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, DragEndEvent, pointerWithin } from '@dnd-kit/core';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';

import { fIsBetween } from 'src/utils/format-time';

import { DashboardContent } from 'src/layouts/dashboard';


import { toast } from 'src/components/snackbar';
import { fileFormat } from 'src/components/file-thumbnail';
import { EmptyContent } from 'src/components/empty-content';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { useTable, rowInPage, getComparator } from 'src/components/table';
import { LoadingScreen } from 'src/components/loading-screen';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { getTreeData, saveTreeData, getFileScript, clearAllScripts, getFullData, saveFullData, deleteFileScripts, deleteTreeItems } from 'src/api/indexDB';
import { FileManagerFilters } from '../file-manager-filters';
import { FileManagerSidebar } from '../file-manager-sidebar';
import { FileManagerGridView } from '../file-manager-grid-view';
import { FileManagerFiltersResult } from '../file-manager-filters-result';
import { FileManagerCreateFolderDialog } from '../file-manager-create-folder-dialog';
import { OpicEditorView } from './opic-editor-view';
import { OpicLiveView } from './opic-live-view';
import TREE_DATA from 'src/api/dummy/default.json';

// ----------------------------------------------------------------------

function DroppableBreadcrumbItem({
  id,
  label,
  onClick,
  isLast,
}: {
  id: string | null;
  label: string;
  onClick?: () => void;
  isLast?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: id === null ? 'root' : id,
  });

  const styles = {
    px: 0.5,
    borderRadius: 0.5,
    transition: (theme: any) => theme.transitions.create(['background-color']),
    ...(isOver && {
      bgcolor: 'action.hover',
      color: 'primary.main',
      fontWeight: 'bold',
    }),
  };

  if (isLast) {
    return (
      <Typography ref={setNodeRef} variant="body2" color="text.primary" sx={styles}>
        {label}
      </Typography>
    );
  }

  return (
    <Link
      ref={setNodeRef}
      component="span"
      color="inherit"
      sx={{ cursor: 'pointer', typography: 'body2', ...styles }}
      onClick={onClick}
    >
      {label}
    </Link>
  );
}

// ----------------------------------------------------------------------

export function FileManagerView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const table = useTable({ defaultRowsPerPage: 10 });

  const confirmDialog = useBoolean();
  const backupConfirm = useBoolean();
  const newFilesDialog = useBoolean();
  const renameDialog = useBoolean();
  const [renameItem, setRenameItem] = useState<IFile | null>(null);

  const recursiveDeleteConfirm = useBoolean();
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);

  const [pendingAction, setPendingAction] = useState<'upload' | 'reset' | null>(null);
  const [pendingUploadData, setPendingUploadData] = useState<any>(null);

  const [viewMode, setViewMode] = useState<'list' | 'editor' | 'live'>('list');
  const [selectedFile, setSelectedFile] = useState<{ id: string; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { state: isCollapsed, setState: setIsCollapsed } = useLocalStorage(
    'file-manager-sidebar-collapsed',
    false
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [treeData, setTreeData] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync URL params to state on mount and when popstate occurs
  useEffect(() => {
    if (isLoaded) {
      const folderId = searchParams.get('folder');
      const view = searchParams.get('view') as 'list' | 'editor' | 'live' | null;
      const fileId = searchParams.get('fileId');
      const fileName = searchParams.get('fileName');

      setCurrentFolderId(folderId || null);
      setViewMode(view || 'list');
      if (fileId && fileName) {
        setSelectedFile({ id: fileId, name: fileName });
      } else {
        setSelectedFile(null);
      }
    }
  }, [searchParams, isLoaded]);

  const updateURL = useCallback(
    (params: { folder?: string | null; view?: string | null; fileId?: string | null; fileName?: string | null }) => {
      const newParams = new URLSearchParams(searchParams.toString());

      if (params.folder !== undefined) {
        if (params.folder) newParams.set('folder', params.folder);
        else newParams.delete('folder');
      }
      if (params.view !== undefined) {
        if (params.view && params.view !== 'list') newParams.set('view', params.view);
        else newParams.delete('view');
      }
      if (params.fileId !== undefined) {
        if (params.fileId) newParams.set('fileId', params.fileId);
        else newParams.delete('fileId');
      }
      if (params.fileName !== undefined) {
        if (params.fileName) newParams.set('fileName', params.fileName);
        else newParams.delete('fileName');
      }

      const query = newParams.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      router.push(url);
    },
    [pathname, router, searchParams]
  );

  const handleMoveItem = useCallback((sourceId: string, targetFolderId: string | null) => {
    if (sourceId === targetFolderId) return;

    // Recursive function to move item
    const moveInTree = (nodes: any[]): { newNodes: any[]; movedItem: any | null } => {
      let movedItem: any = null;

      // 1. Find and remove the item
      const removeNode = (list: any[]): any[] => {
        return list.filter((node) => {
          if (node.id === sourceId) {
            movedItem = node;
            return false;
          }
          if (node.children) {
            const childrenResult = removeNode(node.children);
            node.children = childrenResult;
          }
          return true;
        });
      };

      const filteredTree = removeNode(JSON.parse(JSON.stringify(nodes)));

      if (!movedItem) return { newNodes: nodes, movedItem: null };

      // Check if target is a descendant of source
      const isDescendant = (parent: any, targetId: string): boolean => {
        if (parent.id === targetId) return true;
        if (parent.children) {
          return parent.children.some((child: any) => isDescendant(child, targetId));
        }
        return false;
      };

      if (movedItem.type === 'folder' && targetFolderId && isDescendant(movedItem, targetFolderId)) {
        toast.error('Cannot move a folder into its own descendant!');
        return { newNodes: nodes, movedItem: null };
      }

      // 2. Insert into target folder
      const insertNode = (list: any[]): any[] => {
        if (targetFolderId === null) {
          return [...list, movedItem];
        }
        return list.map((node) => {
          if (node.id === targetFolderId) {
            return {
              ...node,
              children: [...(node.children || []), movedItem],
            };
          }
          if (node.children) {
            return {
              ...node,
              children: insertNode(node.children),
            };
          }
          return node;
        });
      };

      return { newNodes: insertNode(filteredTree), movedItem };
    };

    setTreeData((prev) => {
      const { newNodes, movedItem } = moveInTree(prev);
      if (movedItem) {
        toast.success(`Moved ${movedItem.label} successfully!`);
      }
      return newNodes;
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const sourceId = active.id as string;
        const targetId = over.id as string;

        // 'root' is our special ID for the root folder in breadcrumbs
        const targetFolderId = targetId === 'root' ? null : targetId;

        handleMoveItem(sourceId, targetFolderId);
      }
    },
    [handleMoveItem]
  );

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getTreeData();
        const sanitizedData = sanitizeTreeData(data);
        setTreeData(sanitizedData);
        setIsLoaded(true);
      } catch (error) {
        console.error('Failed to load tree data from IndexedDB', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      saveTreeData(treeData).catch((error) => {
        console.error('Failed to save tree data to IndexedDB', error);
      });
    }
  }, [treeData, isLoaded]);

  const filters = useSetState<IFileFilters>({
    name: '',
    type: [],
    startDate: null,
    endDate: null,
  });
  const { state: currentFilters } = filters;

  // Flatten TREE_DATA to find paths and parents
  const flattenedTree = useMemo(() => {
    const results: any[] = [];
    const flatten = (nodes: any[], parentId: string | null = null, parents: string[] = []) => {
      nodes.forEach((node) => {
        results.push({ ...node, parentId, parentIds: parents });
        if (node.children) {
          flatten(node.children, node.id, [...parents, node.id]);
        }
      });
    };
    flatten(treeData);
    return results;
  }, [treeData]);

  const currentFolder = useMemo(
    () => flattenedTree.find((f) => f.id === currentFolderId),
    [flattenedTree, currentFolderId]
  );

  // Convert TREE_DATA nodes to IFile format for the grid
  const dataForGrid = useMemo(() => {
    const nodes = currentFolderId
      ? flattenedTree.find((f) => f.id === currentFolderId)?.children || []
      : treeData;

    return nodes.map((node: any) => ({
      id: node.id,
      name: node.label,
      type: node.type,
      url: '',
      size: 0,
      tags: [],
      isFavorited: !!node.isFavorited,
      createdAt: node.createdAt,
      modifiedAt: node.modifiedAt,
      shared: null,
      totalFiles: node.children?.length || 0,
    })) as IFile[];
  }, [currentFolderId, flattenedTree, treeData]);

  const dataFiltered = useMemo(
    () =>
      applyFilter({
        inputData: dataForGrid,
        comparator: getComparator(table.order, table.orderBy),
        filters: currentFilters,
      }),
    [dataForGrid, table.order, table.orderBy, currentFilters]
  );

  const dataInPage = rowInPage(dataFiltered, table.page, table.rowsPerPage);

  const canReset =
    !!currentFilters.name ||
    currentFilters.type.length > 0 ||
    (!!currentFilters.startDate && !!currentFilters.endDate);

  const notFound = (!dataFiltered.length && canReset) || !dataFiltered.length;

  const handleOpenFile = useCallback(
    async (id: string) => {
      const item = flattenedTree.find((f) => f.id === id);
      if (item && item.type === 'file') {
        updateURL({ view: 'live', fileId: item.id, fileName: item.label });
      }
    },
    [flattenedTree, updateURL]
  );

  const handleNavigate = useCallback(
    (id: string | null) => {
      if (id === null) {
        updateURL({ folder: null, view: 'list', fileId: null, fileName: null });
        table.onResetPage();
        return;
      }

      const item = flattenedTree.find((f) => f.id === id);
      if (item?.type === 'file') {
        handleOpenFile(id);
      } else {
        updateURL({ folder: id, view: 'list', fileId: null, fileName: null });
        table.onResetPage();
      }
    },
    [updateURL, table, flattenedTree, handleOpenFile]
  );

  const handleCreateItem = useCallback(
    (name: string, type: 'folder' | 'file') => {
      const now = new Date().toISOString();
      const newItem = {
        id: Date.now().toString(),
        label: name,
        type,
        createdAt: now,
        modifiedAt: now,
        ...(type === 'folder' && { children: [] }),
      };

      const updateTree = (nodes: any[]): any[] => {
        if (!currentFolderId) {
          return [...nodes, newItem];
        }

        return nodes.map((node) => {
          if (node.id === currentFolderId) {
            return {
              ...node,
              children: [...(node.children || []), newItem],
            };
          }
          if (node.children) {
            return {
              ...node,
              children: updateTree(node.children),
            };
          }
          return node;
        });
      };

      setTreeData((prev) => updateTree(prev));
      toast.success(`Create ${type} success!`);
    },
    [currentFolderId]
  );

  const handleDownload = useCallback(async () => {
    const fullData = await getFullData();
    const dataStr = JSON.stringify(fullData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = window.URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    link.download = `file-manager-backup-${date}-${time}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    toast.success('Download success!');
  }, []);

  const handleReset = useCallback(async () => {
    await saveFullData(TREE_DATA as any);
    setTreeData(TREE_DATA.tree);
    handleNavigate(null);
    toast.success('Reset success!');
  }, [handleNavigate]);

  const applyUpload = useCallback(async (data: any) => {
    if (data && typeof data === 'object' && 'tree' in data && 'scripts' in data) {
      await saveFullData(data);
      setTreeData(data.tree);
      toast.success('Upload success!');
    } else if (Array.isArray(data)) {
      await saveFullData({ tree: data, scripts: {} });
      setTreeData(data);
      toast.success('Upload success (tree only)!');
    } else {
      toast.error('Invalid JSON format.');
    }
  }, []);

  const handleUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          setPendingUploadData(json);
          setPendingAction('upload');
          backupConfirm.onTrue();
        } catch (error) {
          toast.error('Failed to parse JSON');
        }
      };
      reader.readAsText(file);
    }
    // Reset input value to allow uploading the same file again
    event.target.value = '';
  }, [backupConfirm]);

  const executeDelete = useCallback(
    async (ids: string[]) => {
      try {
        // Atomic deletion in IndexedDB (both tree and scripts)
        await deleteTreeItems(ids);

        // Update local state to reflect changes
        const data = await getTreeData();
        const sanitizedData = sanitizeTreeData(data);
        setTreeData(sanitizedData);

        // Clear selection if any of the deleted IDs were selected
        if (ids.some((id) => table.selected.includes(id))) {
          table.onSelectAllRows(false, []);
        }
        toast.success('Delete success!');
      } catch (error) {
        console.error('Delete failed', error);
        toast.error('Delete failed');
      }
    },
    [table]
  );

  const handleOpenDeleteConfirm = useCallback(
    (ids: string[]) => {
      const hasNonEmptyFolder = ids.some((id) => {
        const item = flattenedTree.find((f) => f.id === id);
        return item?.type === 'folder' && item.children?.length > 0;
      });

      setPendingDeleteIds(ids);

      if (hasNonEmptyFolder) {
        recursiveDeleteConfirm.onTrue();
      } else {
        confirmDialog.onTrue();
      }
    },
    [flattenedTree, recursiveDeleteConfirm, confirmDialog]
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      handleOpenDeleteConfirm([id]);
    },
    [handleOpenDeleteConfirm]
  );

  const handleDeleteItems = useCallback(() => {
    handleOpenDeleteConfirm(table.selected);
  }, [table.selected, handleOpenDeleteConfirm]);

  const handleFavoriteItem = useCallback(
    (id: string) => {
      const updateFavoriteInTree = (nodes: any[]): any[] =>
        nodes.map((node) => {
          if (node.id === id) {
            return { ...node, isFavorited: !node.isFavorited, modifiedAt: new Date().toISOString() };
          }
          if (node.children) {
            return { ...node, children: updateFavoriteInTree(node.children) };
          }
          return node;
        });
      setTreeData((prev) => updateFavoriteInTree(prev));
    },
    []
  );

  const handleOpenRename = useCallback(
    (id: string) => {
      const item = flattenedTree.find((f) => f.id === id);
      if (item) {
        setRenameItem({
          id: item.id,
          name: item.label,
          type: item.type,
          isFavorited: !!item.isFavorited,
          createdAt: item.createdAt,
          modifiedAt: item.modifiedAt,
          url: '',
          size: 0,
          tags: [],
          shared: null,
        } as IFile);
        renameDialog.onTrue();
      }
    },
    [flattenedTree, renameDialog]
  );

  const handleUpdateItemName = useCallback((id: string, name: string) => {
    const updateNameInTree = (nodes: any[]): any[] =>
      nodes.map((node) => {
        if (node.id === id) {
          return { ...node, label: name, modifiedAt: new Date().toISOString() };
        }
        if (node.children) {
          return { ...node, children: updateNameInTree(node.children) };
        }
        return node;
      });
    setTreeData((prev) => updateNameInTree(prev));
    toast.success('Rename success!');
  }, []);

  const handleCopyItem = useCallback(async (id: string) => {
    const fullData = await getFullData();
    const { tree, scripts } = fullData;

    const generateUniqueLabel = (baseLabel: string, existingLabels: string[]) => {
      let newLabel = `${baseLabel} - Copy`;
      let counter = 2;

      while (existingLabels.includes(newLabel)) {
        newLabel = `${baseLabel} - Copy (${counter})`;
        counter++;
      }
      return newLabel;
    };

    const findAndCopy = (nodes: any[]): { newNodes: any[]; copiedNode: any | null } => {
      let copiedNode: any = null;

      const copyNode = (node: any, isRootCopy: boolean, existingLabels: string[]): any => {
        const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newNode = {
          ...node,
          id: newId,
          label: isRootCopy ? generateUniqueLabel(node.label, existingLabels) : node.label,
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
        };

        if (node.type === 'file' && scripts[node.id]) {
          scripts[newId] = JSON.parse(JSON.stringify(scripts[node.id]));
        }

        if (node.children) {
          newNode.children = node.children.map((child: any) => copyNode(child, false, []));
        }

        return newNode;
      };

      const traverse = (list: any[]): any[] => {
        const existingLabels = list.map((n) => n.label);
        return list.flatMap((node) => {
          if (node.id === id) {
            copiedNode = copyNode(node, true, existingLabels);
            return [node, copiedNode];
          }
          if (node.children) {
            return [{ ...node, children: traverse(node.children) }];
          }
          return [node];
        });
      };

      return { newNodes: traverse(tree), copiedNode };
    };

    const { newNodes, copiedNode } = findAndCopy(tree);

    if (copiedNode) {
      await saveFullData({ ...fullData, tree: newNodes, scripts });
      setTreeData(newNodes);
      toast.success(`Copied ${copiedNode.label} successfully!`);
    }
  }, []);

  const renderFilters = () => (
    <Box
      sx={{
        gap: 2,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { xs: 'flex-end', md: 'center' },
      }}
    >
      <FileManagerFilters filters={filters} onResetPage={table.onResetPage} />
    </Box>
  );

  const renderResults = () => (
    <FileManagerFiltersResult
      filters={filters}
      totalResults={dataFiltered.length}
      onResetPage={table.onResetPage}
    />
  );

  const renderUploadFilesDialog = () => (
    <FileManagerCreateFolderDialog open={newFilesDialog.value} onClose={newFilesDialog.onFalse} />
  );

  const renderRenameDialog = () => (
    <FileManagerCreateFolderDialog
      open={renameDialog.value}
      onClose={() => {
        renameDialog.onFalse();
        setRenameItem(null);
      }}
      title="Rename"
      onUpdate={(name) => {
        if (renameItem) {
          handleUpdateItemName(renameItem.id, name);
        }
        renameDialog.onFalse();
        setRenameItem(null);
      }}
      folderName={renameItem?.name || ''}
      existingItems={dataForGrid.filter((item) => item.id !== renameItem?.id)}
      currentType={renameItem?.type}
      hideUpload
      textFieldProps={{
        label: renameItem?.type === 'folder' ? 'Folder name' : 'File name',
      }}
    />
  );

  const renderConfirmDialog = () => (
    <ConfirmDialog
      open={confirmDialog.value}
      onClose={() => {
        confirmDialog.onFalse();
        setPendingDeleteIds([]);
      }}
      title="Delete"
      content={
        <>
          정말 삭제하시겠습니까?
        </>
      }
      action={
        <Button
          variant="contained"
          color="error"
          onClick={async () => {
            await executeDelete(pendingDeleteIds);
            confirmDialog.onFalse();
            setPendingDeleteIds([]);
          }}
        >
          Delete
        </Button>
      }
    />
  );

  const renderBackupConfirmDialog = () => (
    <ConfirmDialog
      open={backupConfirm.value}
      onClose={() => {
        backupConfirm.onFalse();
        setPendingAction(null);
        setPendingUploadData(null);
      }}
      title="백업 확인"
      content="업로드/초기화 전에 파일을 백업하시겠습니까?"
      cancelLabel="취소"
      action={
        <>
          {pendingAction === 'reset' ? (
            <Button
              variant="contained"
              color="error"
              onClick={async () => {
                await handleReset();
                backupConfirm.onFalse();
                setPendingAction(null);
                setPendingUploadData(null);
              }}
            >
              초기화
            </Button>
          ) : (
            <Button
              variant="contained"
              color="primary"
              onClick={async () => {
                if (pendingUploadData) {
                  await applyUpload(pendingUploadData);
                }
                backupConfirm.onFalse();
                setPendingAction(null);
                setPendingUploadData(null);
              }}
            >
              업로드
            </Button>
          )}

          <Button
            variant="contained"
            color="success"
            onClick={async () => {
              await handleDownload();
              if (pendingAction === 'reset') {
                await handleReset();
              } else if (pendingAction === 'upload' && pendingUploadData) {
                await applyUpload(pendingUploadData);
              }
              backupConfirm.onFalse();
              setPendingAction(null);
              setPendingUploadData(null);
            }}
          >
            백업
          </Button>
        </>
      }
    />
  );

  const renderRecursiveDeleteConfirmDialog = () => (
    <ConfirmDialog
      open={recursiveDeleteConfirm.value}
      onClose={() => {
        recursiveDeleteConfirm.onFalse();
        setPendingDeleteIds([]);
      }}
      title="폴더 삭제 경고"
      content={
        <>
          선택한 폴더에 하위 파일이나 폴더가 포함되어 있습니다.
          <br />
          <strong>모든 하위 항목이 함께 삭제됩니다.</strong> 계속하시겠습니까?
        </>
      }
      cancelLabel="취소"
      action={
        <>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              await executeDelete(pendingDeleteIds);
              recursiveDeleteConfirm.onFalse();
              setPendingDeleteIds([]);
            }}
          >
            삭제
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={async () => {
              await handleDownload();
              await executeDelete(pendingDeleteIds);
              recursiveDeleteConfirm.onFalse();
              setPendingDeleteIds([]);
            }}
          >
            백업
          </Button>
        </>
      }
    />
  );

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

  const renderBreadcrumbs = () => {
    const pathNodes = currentFolder?.parentIds.map((pid: string) => flattenedTree.find((f) => f.id === pid)) || [];

    return (
      <Breadcrumbs separator={<ChevronRightIcon sx={{ width: 16, height: 16 }} />} sx={{ mb: 2 }}>
        <DroppableBreadcrumbItem
          id={null}
          label="Root"
          onClick={currentFolderId ? () => handleNavigate(null) : undefined}
          isLast={!currentFolderId}
        />

        {pathNodes.map((node: any) => (
          <DroppableBreadcrumbItem
            key={node.id}
            id={node.id}
            label={node.label}
            onClick={() => handleNavigate(node.id)}
          />
        ))}

        {currentFolderId && (
          <DroppableBreadcrumbItem id={currentFolderId} label={currentFolder?.label} isLast />
        )}
      </Breadcrumbs>
    );
  };

  if (!isLoaded) {
    return <LoadingScreen sx={{ minHeight: '60vh' }} />;
  }

  return (
    <>
      <DashboardContent
        maxWidth={false}
        disablePadding
        sx={{
          display: 'flex',
          flexDirection: 'row',
          flexGrow: 1,
          minHeight: 0,
          maxHeight: '100vh',
          height: '100vh',
          maxWidth: 'none!important',
          m: 0,
          p: 0,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <DndContext sensors={sensors} onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
          <FileManagerSidebar
            data={treeData}
            isCollapsed={isCollapsed}
            onToggle={() => setIsCollapsed(!isCollapsed)}
            selectedId={viewMode === 'list' ? currentFolderId : (selectedFile?.id || null)}
            onSelectId={handleNavigate}
            onOpenFile={handleOpenFile}
            onUpdateName={handleUpdateItemName}
          />

          <Box
            sx={{
              flexGrow: 1,
              minWidth: 0,
              height: '100%',
              overflowY: 'auto',
              ...scrollbarStyles,
            }}
          >
            {viewMode === 'list' ? (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    p: 3,
                    pb: 0,
                    gap: 2,
                    pl: isCollapsed ? 6 : 3,
                    transition: (theme) => theme.transitions.create(['padding-left']),
                  }}
                >
                  <Box>
                    <Typography variant="h4" sx={{ mb: 1 }}>
                      OPIC Drive
                    </Typography>
                    {renderBreadcrumbs()}
                  </Box>

                  <Stack direction="row" spacing={1} sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}>
                    <IconButton
                      color="error"
                      onClick={() => {
                        setPendingAction('reset');
                        backupConfirm.onTrue();
                      }}
                      sx={{
                        bgcolor: 'error.main',
                        color: 'error.contrastText',
                        '&:hover': { bgcolor: 'error.dark' },
                      }}
                    >
                      <RestartAltIcon />
                    </IconButton>

                    <IconButton
                      color="info"
                      onClick={() => fileInputRef.current?.click()}
                      sx={{ bgcolor: 'info.main', color: 'info.contrastText', '&:hover': { bgcolor: 'info.dark' } }}
                    >
                      <CloudUploadIcon />
                    </IconButton>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleUpload}
                      accept=".json"
                      style={{ display: 'none' }}
                    />

                    <IconButton
                      color="success"
                      onClick={handleDownload}
                      sx={{
                        bgcolor: 'success.main',
                        color: 'success.contrastText',
                        '&:hover': { bgcolor: 'success.dark' },
                      }}
                    >
                      <CloudDownloadIcon />
                    </IconButton>
                  </Stack>
                </Box>

                <Stack spacing={2.5} sx={{ p: 3 }}>
                  {renderFilters()}
                  {canReset && renderResults()}
                  <FileManagerGridView
                    table={table}
                    dataFiltered={dataFiltered}
                    onDeleteItem={handleDeleteItem}
                    onFavoriteItem={handleFavoriteItem}
                    onOpenRename={handleOpenRename}
                    onCopyItem={handleCopyItem}
                    onCreateItem={handleCreateItem}
                    onOpenConfirm={handleDeleteItems}
                    onNavigate={handleNavigate}
                    onOpenFile={handleOpenFile}
                    onMoveItem={handleMoveItem}
                    notFound={notFound}
                  />
                </Stack>
              </>
            ) : viewMode === 'editor' && selectedFile ? (
              <OpicEditorView
                fileId={selectedFile.id}
                fileName={selectedFile.name}
                onBack={() => updateURL({ view: 'list', fileId: null, fileName: null })}
                onSaveSuccess={() => updateURL({ view: 'live' })}
                onSave={(id) => {
                  const updateModifiedAt = (nodes: any[]): any[] =>
                    nodes.map((node) => {
                      if (node.id === id) {
                        return { ...node, modifiedAt: new Date().toISOString() };
                      }
                      if (node.children) {
                        return { ...node, children: updateModifiedAt(node.children) };
                      }
                      return node;
                    });
                  setTreeData((prev) => updateModifiedAt(prev));
                }}
              />
            ) : viewMode === 'live' && selectedFile ? (
              <OpicLiveView
                fileId={selectedFile.id}
                fileName={selectedFile.name}
                onBack={() => updateURL({ view: 'list', fileId: null, fileName: null })}
                onEdit={() => updateURL({ view: 'editor' })}
              />
            ) : null}
          </Box>
        </DndContext>
      </DashboardContent>

      {renderUploadFilesDialog()}
      {renderRenameDialog()}
      {renderConfirmDialog()}
      {renderBackupConfirmDialog()}
      {renderRecursiveDeleteConfirmDialog()}
    </>
  );
}

// ----------------------------------------------------------------------

type ApplyFilterProps = {
  inputData: IFile[];
  filters: IFileFilters;
  comparator: (a: any, b: any) => number;
};

function applyFilter({ inputData, comparator, filters }: ApplyFilterProps) {
  const { name, type, startDate, endDate } = filters;

  const stabilizedThis = inputData.map((el, index) => [el, index] as const);

  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) return order;
    return a[1] - b[1];
  });

  inputData = stabilizedThis.map((el) => el[0]);

  if (name) {
    inputData = inputData.filter((file) => file.name.toLowerCase().includes(name.toLowerCase()));
  }

  if (type.length) {
    inputData = inputData.filter((file) => type.includes(fileFormat(file.type)));
  }

  if (startDate && endDate) {
    inputData = inputData.filter((file) => fIsBetween(file.createdAt, startDate, endDate));
  }

  return inputData;
}

// ----------------------------------------------------------------------

function sanitizeTreeData(nodes: any[]): any[] {
  const now = new Date().toISOString();
  return nodes.map((node) => {
    const updatedNode = {
      ...node,
      createdAt: node.createdAt || now,
      modifiedAt: node.modifiedAt || now,
    };
    if (node.children) {
      updatedNode.children = sanitizeTreeData(node.children);
    }
    return updatedNode;
  });
}

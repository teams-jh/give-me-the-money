'use client';

import type { IFile, IFileFilters } from 'src/types/file';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useBoolean, useSetState, useLocalStorage } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';

import { DashboardContent } from 'src/layouts/dashboard';
import { toast } from 'src/components/snackbar';
import { fileFormat } from 'src/components/file-thumbnail';
import { ConfirmDialog } from 'src/components/custom-dialog';
import { useTable, rowInPage, getComparator } from 'src/components/table';
import { LoadingScreen } from 'src/components/loading-screen';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import { getTreeData, saveTreeData, getFullData, saveFullData } from 'src/api/indexDB';
import { FileManagerFilters } from '../file-manager-filters';
import { FileManagerGridView } from '../file-manager-grid-view';
import { FileManagerFiltersResult } from '../file-manager-filters-result';
import { FileManagerCreateFolderDialog } from '../file-manager-create-folder-dialog';
import { OpicTestEditorView } from './opic-test-editor-view';
import { OpicTestLiveView } from './opic-test-live-view';

// ----------------------------------------------------------------------

type Props = {
  title: string;
  category: 'practice' | 'listening';
};

export function FileTestView({ title, category }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const table = useTable({ defaultRowsPerPage: 20 });

  const storageKey = useMemo(() => category, [category]);

  const confirmDialog = useBoolean();
  const renameDialog = useBoolean();

  const [renameItem, setRenameItem] = useState<IFile | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'editor' | 'live'>('list');
  const [selectedFile, setSelectedFile] = useState<{ id: string; name: string } | null>(null);

  const [treeData, setTreeData] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync URL params
  useEffect(() => {
    if (isLoaded) {
      const view = searchParams.get('view') as 'list' | 'editor' | 'live' | null;
      const fileId = searchParams.get('fileId');
      const fileName = searchParams.get('fileName');

      setViewMode(view || 'list');
      if (fileId && fileName) {
        setSelectedFile({ id: fileId, name: fileName });
      } else {
        setSelectedFile(null);
      }
    }
  }, [searchParams, isLoaded]);

  const updateURL = useCallback(
    (params: { view?: string | null; fileId?: string | null; fileName?: string | null }) => {
      const newParams = new URLSearchParams(searchParams.toString());

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

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getTreeData(storageKey);
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
  }, [storageKey]);

  useEffect(() => {
    if (isLoaded) {
      saveTreeData(treeData, storageKey).catch((error) => {
        console.error('Failed to save tree data to IndexedDB', error);
      });
    }
  }, [treeData, isLoaded, storageKey]);

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


  const filters = useSetState<IFileFilters>({
    name: '',
    type: [],
    startDate: null,
    endDate: null,
  });
  const { state: currentFilters } = filters;

  const dataForGrid = useMemo(() => {
    return treeData
      .filter((node: any) => node.type === 'file')
      .map((node: any) => ({
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
        totalFiles: 0,
      })) as IFile[];
  }, [treeData]);

  const dataFiltered = useMemo(
    () =>
      applyFilter({
        inputData: dataForGrid,
        comparator: getComparator(table.order, table.orderBy),
        filters: currentFilters,
      }),
    [dataForGrid, table.order, table.orderBy, currentFilters]
  );

  const canReset =
    !!currentFilters.name ||
    currentFilters.type.length > 0 ||
    (!!currentFilters.startDate && !!currentFilters.endDate);

  const notFound = (!dataFiltered.length && canReset) || !dataFiltered.length;

  const handleOpenFile = useCallback(
    (id: string) => {
      const item = treeData.find((f) => f.id === id);
      if (item) {
        updateURL({ view: 'editor', fileId: item.id, fileName: item.label });
      }
    },
    [treeData, updateURL]
  );

  const handleCreateItem = useCallback(
    (name: string, type: 'folder' | 'file') => {
      if (type === 'folder') {
        toast.error('Only files can be created in this view.');
        return;
      }

      const now = new Date().toISOString();
      const newItem = {
        id: Date.now().toString(),
        label: name,
        type,
        category, // Assign category
        createdAt: now,
        modifiedAt: now,
      };

      setTreeData((prev) => [...prev, newItem]);
      toast.success(`Create file success!`);
    },
    [category]
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      const deleteFromTree = (nodes: any[]): any[] =>
        nodes
          .filter((node) => node.id !== id)
          .map((node) => ({
            ...node,
            children: node.children ? deleteFromTree(node.children) : undefined,
          }));

      setTreeData((prev) => deleteFromTree(prev));
      toast.success('Delete success!');
    },
    []
  );

  const handleDeleteItems = useCallback(() => {
    const idsToDelete = table.selected;

    const deleteFromTree = (nodes: any[]): any[] =>
      nodes
        .filter((node) => !idsToDelete.includes(node.id))
        .map((node) => ({
          ...node,
          children: node.children ? deleteFromTree(node.children) : undefined,
        }));

    setTreeData((prev) => deleteFromTree(prev));
    table.onSelectAllRows(false, []);
    toast.success('Delete success!');
  }, [table]);

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
      const item = treeData.find((f) => f.id === id);
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
    [treeData, renameDialog]
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

  if (!isLoaded) {
    return <LoadingScreen sx={{ minHeight: '60vh' }} />;
  }

  const scrollbarStyles = {
    '&::-webkit-scrollbar': { width: 5, height: 5 },
    '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
    '&::-webkit-scrollbar-thumb': { backgroundColor: (theme: any) => theme.vars.palette.divider, borderRadius: 10 },
    '&::-webkit-scrollbar-thumb:hover': { backgroundColor: (theme: any) => theme.vars.palette.text.disabled },
  };

  return (
    <>
      <DashboardContent
        maxWidth={false}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          p: 0,
          overflow: 'hidden'
        }}
      >
        <Box sx={{ flexGrow: 1, overflowY: 'auto', ...scrollbarStyles, p: 3 }}>
          {viewMode === 'list' ? (
            <>
              <Box sx={{ mb: 3 }}>
                <Typography variant="h4">{title}</Typography>
              </Box>

              <Stack spacing={2.5}>
                <FileManagerFilters filters={filters} onResetPage={table.onResetPage} />
                {canReset && (
                  <FileManagerFiltersResult
                    filters={filters}
                    totalResults={dataFiltered.length}
                    onResetPage={table.onResetPage}
                  />
                )}
                <FileManagerGridView
                  table={table}
                  dataFiltered={dataFiltered}
                  onDeleteItem={handleDeleteItem}
                  onFavoriteItem={handleFavoriteItem}
                  onOpenRename={handleOpenRename}
                  onCreateItem={handleCreateItem}
                  onOpenConfirm={confirmDialog.onTrue}
                  onNavigate={() => { }}
                  onOpenFile={handleOpenFile}
                  notFound={notFound}
                  hideFolder
                />
              </Stack>
            </>
          ) : viewMode === 'editor' && selectedFile ? (
            <OpicTestEditorView
              fileId={selectedFile.id}
              fileName={selectedFile.name}
              storageKey={storageKey}
              onBack={() => updateURL({ view: 'list', fileId: null, fileName: null })}
              onSaveSuccess={() => { }}
              onStartTest={() => updateURL({ view: 'live' })}
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
            <OpicTestLiveView
              fileId={selectedFile.id}
              fileName={selectedFile.name}
              storageKey={storageKey}
              onBack={() => updateURL({ view: 'list', fileId: null, fileName: null })}
              onEdit={() => updateURL({ view: 'editor' })}
            />
          ) : null}
        </Box>
      </DashboardContent>

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

      <ConfirmDialog
        open={confirmDialog.value}
        onClose={confirmDialog.onFalse}
        title="Delete"
        content={
          <>
            정말 삭제 하시겠습니까?
          </>
        }
        action={
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              handleDeleteItems();
              confirmDialog.onFalse();
            }}
          >
            Delete
          </Button>
        }
      />
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

  return inputData;
}

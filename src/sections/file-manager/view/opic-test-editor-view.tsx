'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useBoolean } from 'minimal-shared/hooks';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Autocomplete from '@mui/material/Autocomplete';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { alpha, useTheme } from '@mui/material/styles';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import DeleteIcon from '@mui/icons-material/Delete';

import { getTreeData, getFileScript, saveFileScript } from 'src/api/indexDB';
import { toast } from 'src/components/snackbar';

// ----------------------------------------------------------------------

type PlaylistData = {
  fileIds: string[];
  audioUrlPriority?: boolean;
  randomPlay?: boolean;
  playQuestion?: boolean;
};

type Props = {
  fileId: string;
  fileName: string;
  onBack: () => void;
  onSaveSuccess: () => void;
  onStartTest?: () => void;
  onSave?: (fileId: string) => void;
  storageKey?: string;
};

// ----------------------------------------------------------------------

type SortableScriptItemProps = {
  file: { id: string; label: string; path: string };
  index: number;
  onRemove: (id: string) => void;
};

function SortableScriptItem({ file, index, onRemove }: SortableScriptItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1100 : 'auto',
    opacity: isDragging ? 0.6 : 1,
    position: 'relative' as const,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        border: (theme) => `solid 1px ${theme.vars.palette.divider}`,
        bgcolor: (theme) => isDragging ? alpha(theme.palette.primary.main, 0.08) : alpha(theme.palette.background.neutral, 0.4),
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        touchAction: 'none', // Prevents scrolling while dragging on touch devices
      }}
      {...attributes}
      {...listeners}
    >
      <Typography
        variant="caption"
        sx={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          mr: 2,
          flexShrink: 0
        }}
      >
        {index + 1}
      </Typography>

      <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
          {file.label}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled' }} noWrap>
          {file.path}
        </Typography>
      </Stack>

      <IconButton 
        color="error" 
        onClick={(e) => {
          e.stopPropagation(); // Prevent drag start when clicking delete
          onRemove(file.id);
        }}
        onPointerDown={(e) => e.stopPropagation()} // Important for dnd-kit with buttons
      >
        <DeleteIcon />
      </IconButton>
    </Card>
  );
}

export function OpicTestEditorView({ fileId, fileName, onBack, onSaveSuccess, onStartTest, onSave, storageKey }: Props) {
  const theme = useTheme();

  const [playlist, setPlaylist] = useState<PlaylistData>({ 
    fileIds: [],
    audioUrlPriority: true,
    randomPlay: false,
    playQuestion: true,
  });
  const [driveFiles, setDriveFiles] = useState<{ id: string; label: string; path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const initialPlaylistRef = useRef<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px move required to start dragging
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPlaylist((prev) => {
        const oldIndex = prev.fileIds.indexOf(active.id as string);
        const newIndex = prev.fileIds.indexOf(over.id as string);

        return {
          ...prev,
          fileIds: arrayMove(prev.fileIds, oldIndex, newIndex),
        };
      });
    }
  };

  // Load drive files for autocomplete
  useEffect(() => {
    const loadDrive = async () => {
      try {
        const tree = await getTreeData(); // Defaults to main DRIVE
        const files: { id: string; label: string; path: string }[] = [];
        const seenIds = new Set<string>();

        const flatten = (nodes: any[], parentPath = '') => {
          nodes.forEach((node) => {
            const currentPath = parentPath ? `${parentPath} / ${node.label}` : node.label;
            if (node.type === 'file') {
              if (!seenIds.has(node.id)) {
                files.push({ id: node.id, label: node.label, path: parentPath || 'Root' });
                seenIds.add(node.id);
              }
            }
            if (node.children) flatten(node.children, currentPath);
          });
        };
        flatten(tree);
        setDriveFiles(files);
      } catch (error) {
        console.error('Failed to load drive files', error);
      }
    };
    loadDrive();
  }, []);

  // Load current playlist
  useEffect(() => {
    const loadPlaylist = async () => {
      setLoading(true);
      try {
        const data = await getFileScript(fileId, storageKey);
        if (data && data.fileIds) {
          const uniqueFileIds = Array.from(new Set(data.fileIds as string[]));
          const cleanedData = { 
            ...data, 
            fileIds: uniqueFileIds,
            audioUrlPriority: data.audioUrlPriority ?? true,
            randomPlay: data.randomPlay ?? false,
            playQuestion: data.playQuestion ?? true,
          };
          setPlaylist(cleanedData);
          initialPlaylistRef.current = JSON.stringify(cleanedData);
        } else {
          const defaultPlaylist = { 
            fileIds: [],
            audioUrlPriority: true,
            randomPlay: false,
            playQuestion: true,
          };
          setPlaylist(defaultPlaylist);
          initialPlaylistRef.current = JSON.stringify(defaultPlaylist);
        }
      } catch (error) {
        console.error('Failed to load playlist', error);
      } finally {
        setLoading(false);
      }
    };
    loadPlaylist();
  }, [fileId, storageKey]);

  const handleSave = useCallback(async (silent = false) => {
    try {
      const currentDataStr = JSON.stringify(playlist);
      const hasChanged = currentDataStr !== initialPlaylistRef.current;

      await saveFileScript(fileId, playlist, storageKey);
      onSave?.(fileId);
      
      if (!silent || hasChanged) {
        toast.success('Playlist saved successfully!');
      }

      initialPlaylistRef.current = currentDataStr;
      onSaveSuccess();
    } catch (error) {
      console.error('Failed to save playlist', error);
      toast.error('Failed to save playlist');
    }
  }, [fileId, playlist, storageKey, onSave, onSaveSuccess]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        if (onStartTest) {
          handleSave(true).then(() => {
            onStartTest();
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, onStartTest]);

  const handleRemoveFile = (idToRemove: string) => {
    setPlaylist((prev) => ({
      ...prev,
      fileIds: prev.fileIds.filter((id) => id !== idToRemove),
    }));
  };

  const selectedFiles = useMemo(() => {
    return playlist.fileIds.map(id => driveFiles.find(f => f.id === id)).filter(Boolean) as { id: string; label: string; path: string }[];
  }, [playlist.fileIds, driveFiles]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Typography variant="h6" color="text.secondary">Loading playlist...</Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth={false} sx={{ py: { xs: 2, md: 5 }, px: { xs: 2, md: 8 } }}>
      {/* Sticky Header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={2}
        sx={{
          mb: 4,
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          bgcolor: theme.palette.background.default,
          backgroundImage: 'none',
          '&:before': {
            content: '""',
            position: 'absolute',
            top: -100,
            left: 0,
            right: 0,
            height: 100,
            bgcolor: theme.palette.background.default,
          },
          py: 1.5,
          mx: { xs: -2, md: -8 },
          px: { xs: 2, md: 8 },
        }}
      >
        <IconButton onClick={onBack} sx={{ bgcolor: 'background.neutral' }}>
          <ArrowBackIosIcon sx={{ width: 16, height: 16, ml: 0.5 }} />
        </IconButton>

        <Typography
          variant="h5"
          sx={{
            flexGrow: 1,
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileName}
        </Typography>

        <Stack direction="row" spacing={1}>
          <Tooltip title="저장 (Ctrl + S)">
            <IconButton
              color="primary"
              onClick={() => handleSave(false)}
              sx={{
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                boxShadow: (theme) => theme.customShadows?.primary,
                '&:hover': { bgcolor: 'primary.dark' }
              }}
            >
              <SaveIcon />
            </IconButton>
          </Tooltip>

          {onStartTest && (
            <Tooltip title="Test 시작 (Ctrl + X)">
              <IconButton
                color="info"
                onClick={async () => {
                  await handleSave(true);
                  onStartTest();
                }}
                sx={{
                  bgcolor: 'info.main',
                  color: 'info.contrastText',
                  boxShadow: (theme) => theme.customShadows?.info,
                  '&:hover': { bgcolor: 'info.dark' }
                }}
              >
                <PlayArrowIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      <Stack spacing={4}>
        <Card sx={{ p: 3 }}>
          <Stack spacing={3}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>DRIVE에서 스크립트 추가</Typography>

            <Autocomplete
              multiple
              fullWidth
              disableCloseOnSelect
              options={driveFiles}
              value={selectedFiles}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderTags={() => null}
              renderOption={(props, option, { selected }) => {
                const { key, ...optionProps } = props;
                return (
                  <li key={option.id} {...optionProps}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                      sx={{
                        width: 1,
                        py: 0.5,
                        px: 1,
                        borderRadius: 1,
                        transition: (theme) => theme.transitions.create('background-color'),
                        '&:hover': {
                          bgcolor: 'action.hover',
                        },
                      }}
                    >
                      <Stack spacing={0.2} sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                          variant="subtitle2"
                          noWrap
                          sx={{
                            color: selected ? 'primary.main' : 'text.primary',
                            fontWeight: selected ? 800 : 600
                          }}
                        >
                          {option.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }} noWrap>
                          {option.path}
                        </Typography>
                      </Stack>
                      {selected && (
                        <CheckCircleIcon
                          sx={{ color: 'primary.main', width: 20, height: 20 }}
                        />
                      )}
                    </Stack>
                  </li>
                );
              }}
              onChange={(event, newValue) => {
                setPlaylist((prev) => ({
                  ...prev,
                  fileIds: newValue.map((v) => v.id),
                }));
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="스크립트 검색"
                  placeholder="DRIVE 파일 이름 입력..."
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
            />
          </Stack>
        </Card>

        {storageKey === 'listening' && (
          <Card sx={{ 
            p: 1.5, 
            px: 2, 
            bgcolor: (theme) => alpha(theme.palette.info.main, 0.04), 
            border: (theme) => `dashed 1px ${alpha(theme.palette.info.main, 0.2)}`,
          }}>
            <Stack 
              direction={{ xs: 'column', sm: 'row' }}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              justifyContent="space-between" 
              spacing={1.5}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                <SettingsIcon sx={{ color: 'info.main', width: 20, height: 20 }} />
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    fontWeight: 800, 
                    color: 'info.main', 
                    whiteSpace: 'nowrap',
                    fontSize: { xs: 14, md: 14 }
                  }}
                >
                  Listening 설정
                </Typography>
              </Stack>

              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', sm: 'auto' }, justifyContent: 'flex-end' }}>
                <Stack direction="row" spacing={0.5} sx={{ bgcolor: 'background.neutral', p: 0.4, borderRadius: 1, flexShrink: 0 }}>
                  <Tooltip title="Audio URL이 있는 경우에만 재생됩니다.">
                    <Button
                      size="small"
                      variant={playlist.audioUrlPriority ? 'contained' : 'text'}
                      color={playlist.audioUrlPriority ? 'primary' : 'inherit'}
                      onClick={() => setPlaylist(prev => ({ ...prev, audioUrlPriority: true }))}
                      sx={{ px: { xs: 1.25, md: 2 }, py: 0.5, fontSize: 11.5, fontWeight: 800, height: 30, whiteSpace: 'nowrap' }}
                    >
                      Audio 우선
                    </Button>
                  </Tooltip>
                  <Button
                    size="small"
                    variant={!playlist.audioUrlPriority ? 'contained' : 'text'}
                    color={!playlist.audioUrlPriority ? 'primary' : 'inherit'}
                    onClick={() => setPlaylist(prev => ({ ...prev, audioUrlPriority: false }))}
                    sx={{ px: { xs: 1.25, md: 2 }, py: 0.5, fontSize: 11.5, fontWeight: 800, height: 30, whiteSpace: 'nowrap' }}
                  >
                    Web Speech
                  </Button>
                </Stack>
                
                <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center', opacity: 0.3, mx: { xs: 0.25, sm: 0.5 } }} />

                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                  <Tooltip title={playlist.randomPlay ? "랜덤 재생 On" : "랜덤 재생 Off"}>
                    <IconButton
                      size="small"
                      color={playlist.randomPlay ? 'primary' : 'default'}
                      onClick={() => setPlaylist(prev => ({ ...prev, randomPlay: !prev.randomPlay }))}
                      sx={{ 
                        width: 28,
                        height: 28,
                        bgcolor: (theme) => playlist.randomPlay ? alpha(theme.palette.primary.main, 0.1) : 'background.neutral',
                        border: (theme) => `solid 1px ${playlist.randomPlay ? alpha(theme.palette.primary.main, 0.2) : 'transparent'}`
                      }}
                    >
                      <ShuffleIcon sx={{ width: 16, height: 16 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title={playlist.playQuestion ? "질문 재생 On" : "질문 재생 Off"}>
                    <IconButton
                      size="small"
                      color={playlist.playQuestion ? 'info' : 'default'}
                      onClick={() => setPlaylist(prev => ({ ...prev, playQuestion: !prev.playQuestion }))}
                      sx={{ 
                        width: 28,
                        height: 28,
                        bgcolor: (theme) => playlist.playQuestion ? alpha(theme.palette.info.main, 0.1) : 'background.neutral',
                        border: (theme) => `solid 1px ${playlist.playQuestion ? alpha(theme.palette.info.main, 0.2) : 'transparent'}`
                      }}
                    >
                      <QuestionAnswerIcon sx={{ width: 16, height: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Stack>
          </Card>
        )}

        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              테스트 스크립트 목록 ({selectedFiles.length})
            </Typography>

            {storageKey !== 'listening' && (
              <Tooltip title={playlist.randomPlay ? "랜덤 셔플 On" : "랜덤 셔플 Off"}>
                <IconButton
                  size="small"
                  color={playlist.randomPlay ? 'primary' : 'default'}
                  onClick={() => setPlaylist(prev => ({ ...prev, randomPlay: !prev.randomPlay }))}
                  sx={{ 
                    width: 32,
                    height: 32,
                    bgcolor: (theme) => playlist.randomPlay ? alpha(theme.palette.primary.main, 0.1) : 'background.neutral',
                    border: (theme) => `solid 1px ${playlist.randomPlay ? alpha(theme.palette.primary.main, 0.2) : 'transparent'}`,
                    transition: (theme) => theme.transitions.create(['background-color', 'border-color']),
                    '&:hover': {
                      bgcolor: (theme) => playlist.randomPlay ? alpha(theme.palette.primary.main, 0.2) : alpha(theme.palette.action.hover, 0.1),
                    }
                  }}
                >
                  <ShuffleIcon sx={{ width: 20, height: 20 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          {selectedFiles.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={playlist.fileIds}
                strategy={verticalListSortingStrategy}
              >
                <Stack spacing={1.5} sx={{ userSelect: { xs: 'none', md: 'auto' } }}>
                  {selectedFiles.map((file, index) => (
                    <SortableScriptItem
                      key={file.id}
                      file={file}
                      index={index}
                      onRemove={handleRemoveFile}
                    />
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          ) : (
            <Box
              sx={{
                py: 10,
                textAlign: 'center',
                bgcolor: 'background.neutral',
                borderRadius: 2,
                border: (theme) => `dashed 1px ${theme.vars.palette.divider}`,
              }}
            >
              <NoteAddIcon sx={{ color: 'text.disabled', mb: 2, width: 48, height: 48 }} />
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                추가된 스크립트가 없습니다. 위에서 검색하여 추가해 주세요.
              </Typography>
            </Box>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}


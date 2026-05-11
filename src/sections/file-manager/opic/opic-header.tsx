'use client';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import EditIcon from '@mui/icons-material/Edit';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';

// ----------------------------------------------------------------------

type Props = {
  fileName: string;
  currentIndex: number;
  totalFiles: number;
  currentFileName: string;
  autoPlay: boolean;
  isAudioPlaying: boolean;
  isContentSequence: boolean;
  storageKey?: string;
  randomPlay?: boolean;
  allRevealed: boolean;
  category?: string;
  subCategory?: string;
  comboPositions?: number[];
  testMode?: boolean;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleRandom?: () => void;
  onToggleAllRevealed: () => void;
  onEdit: () => void;
  onToggleAutoPlay?: () => void;
  onToggleTestMode?: () => void;
};

export function OpicHeader({
  fileName,
  currentIndex,
  totalFiles,
  currentFileName,
  autoPlay,
  isAudioPlaying,
  isContentSequence,
  storageKey,
  randomPlay,
  allRevealed,
  category,
  subCategory,
  comboPositions,
  testMode,
  onBack,
  onPrev,
  onNext,
  onToggleRandom,
  onToggleAllRevealed,
  onEdit,
  onToggleAutoPlay,
  onToggleTestMode,
}: Props) {
  return (
    <Stack
      direction="row"
      alignItems={{ xs: 'flex-start', md: 'center' }}
      spacing={2}
      sx={{
        mb: 4,
        position: 'sticky',
        top: 0,
        bgcolor: 'background.default',
        zIndex: 10,
        py: 1.5,
        mx: { xs: -2, md: -8 },
        px: { xs: 2, md: 8 },
        '&:before': {
          content: '""',
          position: 'absolute',
          top: -100,
          left: 0,
          right: 0,
          height: 100,
          bgcolor: 'background.default',
          zIndex: -1,
        },
      }}
    >
      <IconButton onClick={onBack} sx={{ bgcolor: 'background.neutral', mt: { xs: 0.5, md: 0 } }}>
        <ArrowBackIcon />
      </IconButton>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={{ xs: 1, md: 2 }}
        sx={{ flexGrow: 1, overflow: 'hidden' }}
      >
        <Stack spacing={0.5} sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              color: (isContentSequence && autoPlay && !isAudioPlaying) ? 'error.main' : 'text.primary',
              transition: (theme) => theme.transitions.create('color'),
              wordBreak: 'break-all',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {fileName}
          </Typography>

          {totalFiles > 1 ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, wordBreak: 'break-all' }}>
              {currentIndex + 1}/{totalFiles} • {currentFileName}
            </Typography>
          ) : (
            (category || comboPositions?.length ? comboPositions?.length : 0 > 0) && (
              <Stack direction="row" alignItems="center" spacing={1}>
                {category && (
                  <Typography
                    variant="caption"
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: 0.5,
                      bgcolor: (theme) => alpha(theme.palette.info.main, 0.1),
                      color: 'info.main',
                      fontWeight: 800,
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                    }}
                  >
                    {category} {subCategory && `• ${subCategory}`}
                  </Typography>
                )}
                {comboPositions?.map((pos) => (
                  <Box
                    key={pos}
                    sx={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      bgcolor: 'text.primary',
                      color: 'background.paper',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    {pos}
                  </Box>
                ))}
              </Stack>
            )
          )}
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          sx={{
            justifyContent: { xs: 'flex-end', md: 'flex-start' },
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {onPrev && (
            <Tooltip title="Previous Script (Ctrl + ←)">
              <span>
                <IconButton
                  size="small"
                  disabled={currentIndex === 0}
                  onClick={onPrev}
                  sx={{ bgcolor: 'background.neutral' }}
                >
                  <ArrowBackIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}

          {onNext && (
            <Tooltip title="Next Script (Ctrl + →)">
              <span>
                <IconButton
                  size="small"
                  disabled={totalFiles <= 1}
                  onClick={onNext}
                  sx={{ bgcolor: 'background.neutral' }}
                >
                  <ArrowForwardIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}

          {storageKey === 'listening' && onToggleRandom && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 24, alignSelf: 'center' }} />
              <Tooltip title={randomPlay ? "Shuffle: ON" : "Shuffle: OFF"}>
                <IconButton
                  size="small"
                  color={randomPlay ? 'primary' : 'default'}
                  onClick={onToggleRandom}
                  sx={{ bgcolor: (theme) => (randomPlay ? alpha(theme.palette.primary.main, 0.16) : 'background.neutral') }}
                >
                  <ShuffleIcon />
                </IconButton>
              </Tooltip>
            </>
          )}

          {onToggleTestMode && (
            <Tooltip title="Test Mode (Ctrl + X)">
              <IconButton
                color={testMode ? 'info' : 'default'}
                onClick={onToggleTestMode}
                sx={{
                  bgcolor: (theme) => (testMode ? alpha(theme.palette.info.main, 0.16) : 'background.neutral'),
                }}
              >
                <AssignmentTurnedInIcon />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title={allRevealed ? "Hide All (Ctrl + R)" : "Reveal All (Ctrl + R)"}>
            <IconButton
              size="small"
              color={allRevealed ? 'warning' : 'success'}
              onClick={onToggleAllRevealed}
              sx={{ bgcolor: (theme) => (allRevealed ? alpha(theme.palette.warning.main, 0.16) : alpha(theme.palette.success.main, 0.16)) }}
            >
              {allRevealed ? <VisibilityIcon /> : <VisibilityOffIcon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Edit (Ctrl + E)">
            <IconButton size="small" color="primary" onClick={onEdit} sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.16) }}>
              <EditIcon />
            </IconButton>
          </Tooltip>

          {onToggleAutoPlay && (
            <Tooltip title={autoPlay ? (storageKey === 'listening' ? "Stop" : "Auto Play: ON") : (storageKey === 'listening' ? "Play" : "Auto Play: OFF")}>
              <IconButton
                size="small"
                color={autoPlay ? 'primary' : 'default'}
                onClick={onToggleAutoPlay}
                sx={{ bgcolor: (theme) => (autoPlay ? alpha(theme.palette.primary.main, 0.16) : 'background.neutral') }}
              >
                {storageKey === 'listening' ? (
                  autoPlay ? <StopCircleIcon /> : <PlayCircleFilledIcon />
                ) : (
                  autoPlay ? <PlayCircleFilledIcon /> : <PlayCircleOutlineIcon />
                )}
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}

'use client';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';

// ----------------------------------------------------------------------

type Question = {
  en: string;
  ko: string;
};

type Props = {
  questions: Question[];
  speakingIndex: string | number | null;
  sequence: 'idle' | 'question' | 'content';
  autoPlay: boolean;
  testMode: boolean;
  storageKey?: string;
  revealedLines: Record<string, boolean>;
  onToggleSpeak: (text: string, index: string) => void;
  onToggleReveal: (key: string | number) => void;
  playingRef?: React.Ref<HTMLDivElement>;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  audioUrl?: string;
  audioReady?: boolean;
  onAudioCanPlay?: () => void;
  onAudioError?: () => void;
  onAudioPlay?: () => void;
  onAudioPause?: () => void;
  onAudioEnded?: () => void;
};

export function OpicQuestionSection({
  questions,
  speakingIndex,
  sequence,
  autoPlay,
  testMode,
  storageKey,
  revealedLines,
  onToggleSpeak,
  onToggleReveal,
  playingRef,
  audioRef,
  audioUrl,
  audioReady,
  onAudioCanPlay,
  onAudioError,
  onAudioPlay,
  onAudioPause,
  onAudioEnded,
}: Props) {
  const isQuestionActive = speakingIndex === 'auto-question' || (sequence === 'question' && autoPlay);

  return (
    <Card
      ref={isQuestionActive ? playingRef : null}
      sx={{
        p: { xs: 2, md: 3 },
        border: (theme) => isQuestionActive
          ? `solid 2px ${theme.vars.palette.error.main}`
          : `solid 1px ${theme.vars.palette.divider}`,
        bgcolor: (theme) => isQuestionActive
          ? alpha(theme.palette.error.main, 0.04)
          : alpha(theme.palette.background.neutral, 0.5),
        transition: (theme) => theme.transitions.create(['border-color', 'background-color']),
      }}
    >
      <Typography variant="overline" sx={{ color: 'text.disabled', mb: 2, display: 'block' }}>Question</Typography>

      <Stack spacing={3}>
        {questions?.map((q, index) => {
          const qEnKey = `q-en-${index}`;
          const qKoKey = `q-ko-${index}`;
          const isSpeaking = speakingIndex === `q-${index}` || (index === 0 && speakingIndex === 'auto-play');
          const isEnRevealed = revealedLines[qEnKey];
          const isKoRevealed = revealedLines[qKoKey];

          return (
            <Stack key={index} spacing={2.5}>
              <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'flex-start' }} spacing={{ xs: 1.5, md: 2 }}>
                {/* Mobile Top Header: Q Index + Speaker */}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', display: { xs: 'flex', md: 'none' } }}>
                  <Box sx={{ flexShrink: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 900,
                        color: 'text.disabled',
                        bgcolor: 'background.neutral',
                        px: 1,
                        py: 0.25,
                        borderRadius: 0.5,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 32
                      }}
                    >
                      Q{index + 1}
                    </Typography>
                  </Box>
                  {q.en && (
                    <IconButton
                      onClick={() => onToggleSpeak(q.en, index === 0 && speakingIndex === 'auto-play' ? 'auto-play' : `q-${index}`)}
                      size="small"
                      color={isSpeaking ? 'primary' : 'default'}
                      sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08), flexShrink: 0 }}
                    >
                      {isSpeaking ? <StopCircleIcon /> : <VolumeUpIcon />}
                    </IconButton>
                  )}
                </Stack>

                {/* Desktop Q Index */}
                <Box sx={{ mt: 0.5, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 900,
                      color: 'text.disabled',
                      bgcolor: 'background.neutral',
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 0.5,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 32
                    }}
                  >
                    Q{index + 1}
                  </Typography>
                </Box>

                <Typography
                  variant="h6"
                  onClick={() => { if (testMode || storageKey === 'listening') onToggleReveal(qEnKey); }}
                  sx={{
                    lineHeight: 1.5,
                    fontWeight: 700,
                    flexGrow: 1,
                    color: (isSpeaking || (index === 0 && (speakingIndex === 'auto-play' || speakingIndex === 'auto-question'))) ? 'error.main' : 'text.primary',
                    fontSize: { xs: '1.0625rem', md: '1.125rem' },
                    cursor: (testMode || storageKey === 'listening') ? 'pointer' : 'default',
                    transition: (theme) => theme.transitions.create(['filter', 'opacity', 'color']),
                    ...((testMode || storageKey === 'listening') && !isEnRevealed && {
                      filter: 'blur(8px)',
                      opacity: 0.3,
                      userSelect: 'none'
                    }),
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {q.en || 'Untitled Question'}
                </Typography>

                {/* Desktop Speaker Icon */}
                {q.en && (
                  <IconButton
                    onClick={() => onToggleSpeak(q.en, index === 0 && speakingIndex === 'auto-play' ? 'auto-play' : `q-${index}`)}
                    size="small"
                    color={isSpeaking ? 'primary' : 'default'}
                    sx={{
                      mt: -0.5,
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                      flexShrink: 0,
                      display: { xs: 'none', md: 'inline-flex' }
                    }}
                  >
                    {isSpeaking ? <StopCircleIcon /> : <VolumeUpIcon />}
                  </IconButton>
                )}
              </Stack>

              {q.ko && (
                <Box
                  onClick={() => onToggleReveal(qKoKey)}
                  sx={{
                    ml: { xs: 0, md: 4 },
                    p: { xs: 1.5, md: 2 },
                    cursor: 'pointer',
                    borderRadius: 1.5,
                    bgcolor: 'background.paper',
                    border: (theme) => `dashed 1px ${theme.vars.palette.divider}`,
                    transition: (theme) => theme.transitions.create(['background-color']),
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      textAlign: 'justify',
                      transition: (theme) => theme.transitions.create(['filter', 'opacity']),
                      ...(!isKoRevealed && {
                        filter: 'blur(6px)',
                        opacity: 0.4,
                        userSelect: 'none'
                      }),
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {q.ko}
                  </Typography>
                </Box>
              )}
              {index < questions.length - 1 && <Divider sx={{ borderStyle: 'dotted' }} />}
            </Stack>
          );
        })}
      </Stack>

      {audioUrl && (
        <Box sx={{
          mt: 3,
          display: audioReady ? 'block' : 'none'
        }}>
          <Divider sx={{ mb: 2, borderStyle: 'dashed' }} />
          <audio
            ref={audioRef}
            controls
            src={audioUrl}
            style={{ width: '100%' }}
            onCanPlay={onAudioCanPlay}
            onError={onAudioError}
            onPlay={onAudioPlay}
            onPause={onAudioPause}
            onEnded={onAudioEnded}
          />
        </Box>
      )}
    </Card>
  );
}

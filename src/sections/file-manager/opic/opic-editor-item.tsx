'use client';

import { memo, useState, useEffect, useRef } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { alpha } from '@mui/material/styles';

import SwapVertIcon from '@mui/icons-material/SwapVert';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import RefreshIcon from '@mui/icons-material/Refresh';
import MicIcon from '@mui/icons-material/Mic';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';

// ----------------------------------------------------------------------

type Line = {
  ko: string;
  en: string;
};

type Props = {
  index: number;
  line: Line;
  isMobile: boolean;
  speakingIndex: boolean;
  isListening: boolean;
  isPreparing: boolean;
  playingIndex: boolean;
  recordedAudio?: string;
  setInputRef: (index: number, el: any) => void;
  onRemoveLine: (index: number) => void;
  onChangeLine: (index: number, field: keyof Line, value: string) => void;
  onToggleSpeak: (text: string, index: string) => void;
  onStartListening: (index: number) => void;
  onStopListening: () => void;
  onPlayRecordedAudio: (index: number) => void;
};

export const OpicEditorItem = memo(({
  index,
  line,
  isMobile,
  speakingIndex,
  isListening,
  isPreparing,
  playingIndex,
  recordedAudio,
  setInputRef,
  onRemoveLine,
  onChangeLine,
  onToggleSpeak,
  onStartListening,
  onStopListening,
  onPlayRecordedAudio,
}: Props) => {
  const [localKo, setLocalKo] = useState(line.ko);
  const [localEn, setLocalEn] = useState(line.en);
  
  const lastKoRef = useRef(line.ko);
  const lastEnRef = useRef(line.en);
  
  const koTimerRef = useRef<NodeJS.Timeout | null>(null);
  const enTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync from props (e.g. bulk import or speech)
  useEffect(() => {
    if (line.ko !== lastKoRef.current) {
      setLocalKo(line.ko);
      lastKoRef.current = line.ko;
    }
    if (line.en !== lastEnRef.current) {
      setLocalEn(line.en);
      lastEnRef.current = line.en;
    }
  }, [line.ko, line.en]);

  // Clean up
  useEffect(() => () => {
    if (koTimerRef.current) clearTimeout(koTimerRef.current);
    if (enTimerRef.current) clearTimeout(enTimerRef.current);
  }, []);

  const handleChangeKo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setLocalKo(value);
    lastKoRef.current = value;
    
    if (koTimerRef.current) clearTimeout(koTimerRef.current);
    koTimerRef.current = setTimeout(() => {
      onChangeLine(index, 'ko', value);
    }, 500);
  };

  const handleChangeEn = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setLocalEn(value);
    lastEnRef.current = value;

    if (enTimerRef.current) clearTimeout(enTimerRef.current);
    enTimerRef.current = setTimeout(() => {
      onChangeLine(index, 'en', value);
    }, 500);
  };

  const handleBlur = (field: keyof Line) => {
    if (field === 'ko') {
      if (koTimerRef.current) clearTimeout(koTimerRef.current);
      onChangeLine(index, 'ko', localKo);
    } else {
      if (enTimerRef.current) clearTimeout(enTimerRef.current);
      onChangeLine(index, 'en', localEn);
    }
  };

  const handleAction = (type: 'listening' | 'audio' | 'speak') => {
    // Sync before any action
    if (koTimerRef.current) clearTimeout(koTimerRef.current);
    if (enTimerRef.current) clearTimeout(enTimerRef.current);
    onChangeLine(index, 'ko', localKo);
    onChangeLine(index, 'en', localEn);

    if (type === 'listening') {
      if (isListening) onStopListening();
      else onStartListening(index);
    } else if (type === 'audio') {
      onPlayRecordedAudio(index);
    } else if (type === 'speak') {
      onToggleSpeak(localEn, `tts-${index}`);
    }
  };

  const hasKoreanInEn = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(localEn);

  const handleSwap = () => {
    const tempKo = localKo;
    const tempEn = localEn;
    
    setLocalKo(tempEn);
    setLocalEn(tempKo);
    
    lastKoRef.current = tempEn;
    lastEnRef.current = tempKo;
    
    if (koTimerRef.current) clearTimeout(koTimerRef.current);
    if (enTimerRef.current) clearTimeout(enTimerRef.current);
    
    onChangeLine(index, 'ko', tempEn);
    onChangeLine(index, 'en', tempKo);
  };

  return (
    <Card
      sx={{
        p: 2.5,
        border: (theme) => `solid 1px ${theme.vars.palette.divider}`,
        bgcolor: (theme) => alpha(theme.palette.background.neutral, 0.3),
        position: 'relative',
        '&:hover .delete-btn': { opacity: 1 }
      }}
    >
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            bgcolor: 'text.disabled',
            color: 'background.paper',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
            flexShrink: 0,
            mt: 1.5
          }}
        >
          {index + 1}
        </Box>
        <Stack spacing={2.5} sx={{ flexGrow: 1 }}>
          <TextField
            fullWidth
            label="Korean"
            value={localKo}
            onChange={handleChangeKo}
            onBlur={() => handleBlur('ko')}
            multiline
            variant="standard"
            placeholder="Korean line..."
            slotProps={{
              input: { sx: { fontWeight: 600 } }
            }}
          />
          <TextField
            fullWidth
            label="English"
            value={localEn}
            onChange={handleChangeEn}
            onBlur={() => handleBlur('en')}
            multiline
            minRows={isMobile ? 3 : 1}
            inputRef={(el) => setInputRef(index, el)}
            variant="standard"
            placeholder="English translation..."
            slotProps={{
              input: { 
                sx: { 
                  color: hasKoreanInEn ? 'error.main' : 'primary.main', 
                  fontWeight: 500 
                },
                endAdornment: (
                  <InputAdornment position="end" sx={{ gap: 0.5 }}>
                    {hasKoreanInEn && (
                      <IconButton
                        size="small"
                        color="warning"
                        onClick={handleSwap}
                        title="Swap Korean and English"
                      >
                        <SwapVertIcon />
                      </IconButton>
                    )}
                    <IconButton
                      size="small"
                      color={speakingIndex ? 'primary' : 'default'}
                      onClick={() => handleAction('speak')}
                    >
                      {speakingIndex ? <StopCircleIcon /> : <VolumeUpIcon />}
                    </IconButton>
                    <IconButton
                      size="small"
                      color={isListening ? 'error' : 'default'}
                      onClick={() => handleAction('listening')}
                      sx={{
                        ...(isListening && !isPreparing && {
                          animation: 'pulse 1.5s infinite',
                          '@keyframes pulse': {
                            '0%': { transform: 'scale(1)', opacity: 1 },
                            '50%': { transform: 'scale(1.2)', opacity: 0.7 },
                            '100%': { transform: 'scale(1)', opacity: 1 },
                          },
                        }),
                        ...(isPreparing && isListening && {
                          animation: 'rotate 1s linear infinite',
                          '@keyframes rotate': {
                            'from': { transform: 'rotate(0deg)' },
                            'to': { transform: 'rotate(360deg)' },
                          },
                        }),
                      }}
                    >
                        {isListening 
                          ? (isPreparing ? <RefreshIcon /> : <StopCircleIcon />) 
                          : <MicIcon />}
                    </IconButton>
                    {!isMobile && (
                      <IconButton
                        size="small"
                        disabled={!recordedAudio}
                        onClick={() => handleAction('audio')}
                        sx={{
                          color: playingIndex ? 'info.main' : recordedAudio ? 'info.main' : 'text.disabled',
                          bgcolor: (theme) => (playingIndex || recordedAudio) ? alpha(theme.palette.info.main, 0.08) : 'transparent',
                        }}
                      >
                        {playingIndex ? <StopCircleIcon /> : <PlayArrowIcon />}
                      </IconButton>
                    )}
                  </InputAdornment>
                )
              }
            }}
          />
        </Stack>

        <IconButton
          className="delete-btn"
          color="error"
          onClick={() => onRemoveLine(index)}
          sx={{
            mt: 1,
            opacity: { xs: 1, md: 0 },
            transition: (theme) => theme.transitions.create('opacity'),
            bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
            '&:hover': { bgcolor: (theme) => alpha(theme.palette.error.main, 0.16) }
          }}
        >
          <DeleteIcon />
        </IconButton>
      </Stack>
    </Card>
  );
});

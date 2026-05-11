'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useBoolean } from 'minimal-shared/hooks';
import { getIsMobile } from 'src/utils/is-mobile';
import { useOpicSpeech } from '../hooks/use-opic-speech';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { alpha, useTheme } from '@mui/material/styles';

import { OpicEditorItem } from '../opic';

import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import { getFileScript, saveFileScript } from 'src/api/indexDB';
import { toast } from 'src/components/snackbar';

// ----------------------------------------------------------------------

type Line = {
  ko: string;
  en: string;
};

type Question = {
  en: string;
  ko: string;
};

type ScriptData = {
  questions: Question[];
  audioUrl: string;
  category?: string;
  subCategory?: string;
  comboPositions?: number[];
  lines: Line[];
};

const CATEGORY_OPTIONS = ['자기소개', '콤보 세트', '롤플레이', '14, 15'];

const SUB_CATEGORY_OPTIONS: Record<string, string[]> = {
  '콤보 세트': [
    '활동 묘사',
    '사물 묘사',
    '인물 묘사',
    '장소 묘사',
    '시간 순서',
    '준비물',
    '첫 계기',
    '최근 경험',
    '특별한 경험',
    '비교',
    '기타',
  ],
  '롤플레이': [
    '질문, 제안하기',
    '문제 설명 및 대안 제시',
    '에바에게 질문하기',
    '13번 - 과거 경험',
  ],
  '14, 15': [
    '과거 현재 비교',
    '사회 이슈',
  ],
  '자기소개': [],
};

type Props = {
  fileId: string;
  fileName: string;
  onBack: () => void;
  onSaveSuccess: () => void;
  onSave?: (fileId: string) => void;
};

export function OpicEditorView({ fileId, fileName, onBack, onSaveSuccess, onSave }: Props) {
  const theme = useTheme();

  const [scriptData, setScriptData] = useState<ScriptData>({
    questions: [{ en: '', ko: '' }],
    audioUrl: '',
    category: '',
    subCategory: '',
    comboPositions: [],
    lines: [{ ko: '', en: '' }],
  });

  const [loading, setLoading] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const bulkModal = useBoolean();

  const isMobile = getIsMobile();

  const {
    userAnswers,
    setUserAnswers,
    recordedAudios,
    setRecordedAudios,
    isListening,
    isPreparing,
    playingIndex,
    speakingIndex,
    inputRefs,
    startListening,
    stopListening,
    playRecordedAudio,
    toggleSpeak,
    resetStates,
  } = useOpicSpeech();

  // Sync userAnswers from speech to scriptData
  useEffect(() => {
    Object.entries(userAnswers).forEach(([idx, text]) => {
      const index = parseInt(idx, 10);
      if (scriptData.lines[index] && scriptData.lines[index].en !== text) {
        handleChangeLine(index, 'en', text);
      }
    });
  }, [userAnswers, scriptData.lines]);

  useEffect(() => {
    const loadScript = async () => {
      setLoading(true);
      resetStates();
      
      try {
        const data = await getFileScript(fileId);
        
        let questions = data?.questions;
        if (data && !questions && (data.questionEn || data.question)) {
          questions = [{
            en: data.questionEn || data.question || '',
            ko: data.questionKo || ''
          }];
        }
        if (!questions || questions.length === 0) {
          questions = [{ en: '', ko: '' }];
        }

        setScriptData({
          questions,
          audioUrl: data?.audioUrl || '',
          category: data?.category || '',
          subCategory: data?.subCategory || '',
          comboPositions: data?.comboPositions || [],
          lines: data?.lines || [{ ko: '', en: '' }],
        });
        setAudioReady(false);
        setAudioError(false);
      } catch (error) {
        console.error('Failed to load script', error);
      } finally {
        setLoading(false);
      }
    };
    loadScript();
  }, [fileId, resetStates]);

  const handleSave = useCallback(async () => {
    try {
      await saveFileScript(fileId, scriptData);
      onSave?.(fileId);
      toast.success('Script saved successfully!');
      onSaveSuccess();
    } catch (error) {
      console.error('Failed to save script', error);
      toast.error('Failed to save script');
    }
  }, [fileId, scriptData, onSave, onSaveSuccess]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const handleAddLine = useCallback(() => {
    setScriptData((prev) => ({
      ...prev,
      lines: [...prev.lines, { ko: '', en: '' }],
    }));
  }, []);

  const handleRemoveLine = useCallback((index: number) => {
    setScriptData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  }, []);

  const handleChangeLine = useCallback((index: number, field: keyof Line, value: string) => {
    if (field === 'en') {
      setUserAnswers((prev) => {
        if (prev[index] === value) return prev;
        return { ...prev, [index]: value };
      });
    }
    setScriptData((prev) => {
      const newLines = [...prev.lines];
      if (newLines[index] && newLines[index][field] === value) return prev;
      newLines[index] = { ...newLines[index], [field]: value };
      return { ...prev, lines: newLines };
    });
  }, [setUserAnswers]);

  const setInputRef = useCallback((index: number, el: any) => {
    inputRefs.current[index] = el;
  }, [inputRefs]);

  const handleBulkApply = () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const newLines: Line[] = [];
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i + 1]) {
        newLines.push({ ko: lines[i], en: lines[i + 1] });
      }
    }

    if (newLines.length > 0) {
      setScriptData((prev) => ({
        ...prev,
        lines: newLines,
      }));
      setBulkText('');
      bulkModal.onFalse();
      toast.success(`${newLines.length} lines applied!`);
    } else {
      toast.error('Invalid format. Please provide Korean and English pairs.');
    }
  };

  const handleSwapQuestion = (index: number) => {
    const newQuestions = [...scriptData.questions];
    const q = newQuestions[index];
    newQuestions[index] = { en: q.ko, ko: q.en };
    setScriptData({ ...scriptData, questions: newQuestions });
  };



  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Typography variant="h6" color="text.secondary">Loading editor...</Typography>
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
          bgcolor: 'background.default',
          zIndex: 10,
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
          Edit: {fileName}
        </Typography>

        <Tooltip title="Save (Ctrl + S)">
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            startIcon={<SaveIcon />}
            sx={{ boxShadow: (theme) => theme.customShadows?.primary }}
          >
            Save
          </Button>
        </Tooltip>
      </Stack>

      <Stack spacing={4}>
        {/* Category Selection */}
        <Stack 
          direction={{ xs: 'column', md: 'row' }} 
          spacing={2} 
          sx={{ width: '100%', alignItems: { xs: 'stretch', md: 'center' } }}
        >
          <FormControl sx={{ flex: 1, minWidth: { md: 200 }, width: '100%' }}>
            <InputLabel>문제 유형 (Category)</InputLabel>
            <Select
              label="문제 유형 (Category)"
              value={scriptData.category || ''}
              onChange={(e) => {
                const cat = e.target.value;
                let positions: number[] = [];
                if (cat === '자기소개') positions = [1];
                
                setScriptData({
                  ...scriptData,
                  category: cat,
                  subCategory: '',
                  comboPositions: positions
                });
              }}
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 1.5,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: (theme) => alpha(theme.palette.grey[500], 0.2),
                }
              }}
            >
              <MenuItem value=""><em>미지정</em></MenuItem>
              {CATEGORY_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {scriptData.category && scriptData.category !== '자기소개' && (
            <FormControl sx={{ flex: 1, minWidth: { md: 200 }, width: '100%' }}>
              <InputLabel>세부 유형 (Sub-category)</InputLabel>
              <Select
                label="세부 유형 (Sub-category)"
                value={scriptData.subCategory || ''}
                onChange={(e) => {
                  const subCat = e.target.value;
                  let positions = scriptData.comboPositions || [];
                  
                  if (scriptData.category === '롤플레이' && subCat === '13번 - 과거 경험') {
                    positions = [13];
                  } else if (scriptData.category === '14, 15') {
                    if (subCat === '과거 현재 비교') positions = [14];
                    else if (subCat === '사회 이슈') positions = [15];
                  }
                  
                  setScriptData({ 
                    ...scriptData, 
                    subCategory: subCat,
                    comboPositions: positions 
                  });
                }}
                sx={{ 
                  bgcolor: 'background.paper',
                  borderRadius: 1.5,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: (theme) => alpha(theme.palette.grey[500], 0.2),
                  }
                }}
              >
                <MenuItem value=""><em>미지정</em></MenuItem>
                {SUB_CATEGORY_OPTIONS[scriptData.category]?.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {(scriptData.category === '자기소개' || ((scriptData.category === '콤보 세트' || scriptData.category === '롤플레이' || scriptData.category === '14, 15') && scriptData.subCategory)) && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 1.5,
                height: 56,
                borderRadius: 1.5,
                position: 'relative',
                bgcolor: 'background.paper',
                border: (theme) => `solid 1px ${alpha(theme.palette.grey[500], 0.2)}`,
                flexShrink: 0,
                alignSelf: { xs: 'flex-end', md: 'center' },
                ...((
                  scriptData.category === '자기소개' ||
                  (scriptData.category === '롤플레이' && scriptData.subCategory === '13번 - 과거 경험') ||
                  (scriptData.category === '14, 15' && (scriptData.subCategory === '과거 현재 비교' || scriptData.subCategory === '사회 이슈'))
                ) && {
                  bgcolor: (theme) => alpha(theme.palette.action.disabledBackground, 0.12),
                  opacity: 0.9,
                  pointerEvents: 'none',
                })
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  px: 0.5,
                  top: -9,
                  left: 10,
                  fontWeight: 700,
                  position: 'absolute',
                  color: 'text.secondary',
                  bgcolor: 'background.default',
                }}
              >
                {scriptData.category === '콤보 세트' ? '콤보 위치' : '문제 위치'}
              </Typography>

              <ToggleButtonGroup
                size="small"
                value={scriptData.comboPositions || []}
                disabled={
                  scriptData.category === '자기소개' ||
                  (scriptData.category === '롤플레이' && scriptData.subCategory === '13번 - 과거 경험') ||
                  (scriptData.category === '14, 15' && (scriptData.subCategory === '과거 현재 비교' || scriptData.subCategory === '사회 이슈'))
                }
                onChange={(_, newPositions) => {
                  setScriptData({ ...scriptData, comboPositions: newPositions });
                }}
                sx={{ 
                  '& .MuiToggleButton-root': {
                    border: 'none',
                    width: 32,
                    height: 32,
                    borderRadius: '50% !important',
                    mx: 0.25,
                    fontWeight: 800,
                    fontSize: 12,
                      '&.Mui-selected': {
                        bgcolor: 'text.primary',
                        color: 'background.paper',
                        '&:hover': { bgcolor: 'grey.800' },
                        '&.Mui-disabled': {
                          bgcolor: 'text.primary',
                          color: 'background.paper',
                          opacity: 0.9
                        }
                      },
                      '&.Mui-disabled': {
                        color: 'text.disabled'
                      }
                  }
                }}
              >
                {(() => {
                  if (scriptData.category === '자기소개') return [1];
                  if (scriptData.category === '롤플레이') {
                    if (scriptData.subCategory === '13번 - 과거 경험') return [13];
                    return [11, 12];
                  }
                  if (scriptData.category === '14, 15') {
                    if (scriptData.subCategory === '과거 현재 비교') return [14];
                    if (scriptData.subCategory === '사회 이슈') return [15];
                    return [14, 15];
                  }
                  return [1, 2, 3];
                })().map((pos) => (
                  <ToggleButton key={pos} value={pos}>
                    {pos}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )}
        </Stack>

        {/* Question Configuration */}
        <Card sx={{ p: 3, border: (theme) => `solid 1px ${theme.vars.palette.divider}` }}>
          <Stack spacing={3}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Configuration</Typography>

            <Stack spacing={3}>
              {scriptData.questions.map((q, index) => (
                <Stack key={index} spacing={3} sx={{ position: 'relative' }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled', mt: 1 }}>
                      Q{index + 1}
                    </Typography>
                    <Stack spacing={2} sx={{ flexGrow: 1 }}>
                      <TextField
                        fullWidth
                        label="English Question"
                        value={q.en}
                        onChange={(e) => {
                          const newQuestions = [...scriptData.questions];
                          newQuestions[index] = { ...newQuestions[index], en: e.target.value };
                          setScriptData({ ...scriptData, questions: newQuestions });
                        }}
                        multiline
                        minRows={2}
                        placeholder="Type the English question here..."
                        slotProps={{
                          input: {
                            sx: { color: /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(q.en) ? 'error.main' : 'inherit' },
                            endAdornment: /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(q.en) && (
                              <InputAdornment position="end">
                                <IconButton 
                                  size="small" 
                                  color="warning" 
                                  onClick={() => handleSwapQuestion(index)}
                                  title="Swap Korean and English"
                                >
                                  <SwapVertIcon />
                                </IconButton>
                              </InputAdornment>
                            )
                          }
                        }}
                      />
                      <TextField
                        fullWidth
                        label="Korean Translation"
                        value={q.ko}
                        onChange={(e) => {
                          const newQuestions = [...scriptData.questions];
                          newQuestions[index] = { ...newQuestions[index], ko: e.target.value };
                          setScriptData({ ...scriptData, questions: newQuestions });
                        }}
                        multiline
                        minRows={2}
                        placeholder="Type the Korean translation here..."
                      />
                    </Stack>
                    <IconButton
                      color="error"
                      disabled={scriptData.questions.length === 1}
                      onClick={() => {
                        const newQuestions = scriptData.questions.filter((_, i) => i !== index);
                        setScriptData({ ...scriptData, questions: newQuestions });
                      }}
                      sx={{ mt: 1 }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                  {index < scriptData.questions.length - 1 && <Divider sx={{ borderStyle: 'dotted' }} />}
                </Stack>
              ))}

              <Button
                size="large"
                variant="outlined"
                fullWidth
                startIcon={<AddIcon />}
                onClick={() => {
                  setScriptData({
                    ...scriptData,
                    questions: [...scriptData.questions, { en: '', ko: '' }]
                  });
                }}
                sx={{
                  py: 2,
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderRadius: 2,
                  borderColor: 'divider',
                  '&:hover': { borderColor: 'primary.main', bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04) }
                }}
              >
                Add Question Set
              </Button>
            </Stack>

            <Divider sx={{ borderStyle: 'dashed' }} />

            <TextField
              fullWidth
              label="Audio URL"
              value={scriptData.audioUrl}
              onChange={(e) => {
                setScriptData({ ...scriptData, audioUrl: e.target.value });
                setAudioReady(false);
                setAudioError(false);
              }}
              placeholder="https://example.com/audio.mp3"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <MusicNoteIcon sx={{ color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />

            {scriptData.audioUrl && (
              <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}>
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 1, fontWeight: 800 }}>AUDIO PREVIEW</Typography>
                
                {audioError && (
                  <Typography variant="body2" color="error" sx={{ fontWeight: 700, mb: 1 }}>
                    존재하지 않는 URL입니다
                  </Typography>
                )}

                {!audioReady && !audioError && (
                  <Typography variant="body2" sx={{ color: 'text.disabled', mb: 1 }}>
                    Checking audio source...
                  </Typography>
                )}

                <audio 
                  controls 
                  src={scriptData.audioUrl} 
                  style={{ width: '100%', display: audioReady ? 'block' : 'none' }} 
                  onCanPlay={() => {
                    setAudioReady(true);
                    setAudioError(false);
                  }}
                  onError={() => {
                    setAudioReady(false);
                    setAudioError(true);
                  }}
                />
              </Box>
            )}
          </Stack>
        </Card>

        {/* Script Lines Section */}
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Script Lines
              <Typography component="span" variant="body2" sx={{ ml: 1, color: 'text.disabled', fontWeight: 400 }}>
                ({scriptData.lines.length} lines)
              </Typography>
            </Typography>
            <Button
              size="small"
              variant="soft"
              color="info"
              startIcon={<ImportExportIcon />}
              onClick={() => {
                const text = scriptData.lines
                  .filter((line) => line.ko || line.en)
                  .map((line) => `${line.ko}\n${line.en}`)
                  .join('\n\n');
                setBulkText(text);
                bulkModal.onTrue();
              }}
            >
              Bulk Import
            </Button>
          </Stack>

          <Stack spacing={2}>
            {scriptData.lines.map((line, index) => (
              <OpicEditorItem
                key={index}
                index={index}
                line={line}
                isMobile={isMobile}
                speakingIndex={speakingIndex === `tts-${index}`}
                isListening={isListening === index}
                isPreparing={isPreparing}
                playingIndex={playingIndex === index}
                recordedAudio={recordedAudios[index]}
                setInputRef={setInputRef}
                onRemoveLine={handleRemoveLine}
                onChangeLine={handleChangeLine}
                onToggleSpeak={toggleSpeak}
                onStartListening={startListening}
                onStopListening={stopListening}
                onPlayRecordedAudio={playRecordedAudio}
              />
            ))}
          </Stack>

          <Button
            startIcon={<AddIcon />}
            onClick={handleAddLine}
            variant="outlined"
            fullWidth
            size="large"
            sx={{
              py: 2,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderRadius: 2,
              borderColor: 'divider',
              '&:hover': { borderColor: 'primary.main', bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04) }
            }}
          >
            Add New Line
          </Button>
        </Stack>
      </Stack>

      {/* Footer Save Button for Mobile */}
      <Box sx={{ mt: 8, pb: 10, display: 'flex', justifyContent: 'center' }}>
        <Tooltip title="Save Script (Ctrl + S)">
          <Button
            variant="contained"
            size="large"
            color="primary"
            onClick={handleSave}
            sx={{
              px: 8,
              height: 56,
              borderRadius: 2,
              boxShadow: (theme) => theme.customShadows?.primary
            }}
          >
            Save Script
          </Button>
        </Tooltip>
      </Box>

      <Dialog open={bulkModal.value} onClose={bulkModal.onFalse} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: 800 }}>Bulk Import Lines</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
            Paste Korean and English pairs below. Each pair will be converted into one script line.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={12}
            placeholder={"Korean line 1\nEnglish translation 1\n\nKorean line 2\nEnglish translation 2..."}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            sx={{
              '& .MuiInputBase-root': { fontFamily: 'monospace', fontSize: 14 }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={bulkModal.onFalse} color="inherit" variant="outlined">Cancel</Button>
          <Button
            variant="contained"
            color="info"
            onClick={handleBulkApply}
            disabled={!bulkText.trim()}
          >
            Apply to Script
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

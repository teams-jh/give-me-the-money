'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';

import DescriptionIcon from '@mui/icons-material/Description';
import { getFileScript, getTreeData, saveFileScript } from 'src/api/indexDB';
import { toast } from 'src/components/snackbar';
import { getIsMobile } from 'src/utils/is-mobile';
import { useOpicSpeech } from '../hooks/use-opic-speech';
import { OpicHeader, OpicScriptItem, OpicQuestionSection } from '../opic';

// ----------------------------------------------------------------------

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

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
  onEdit: () => void;
  storageKey?: string;
};

export function OpicTestLiveView({ fileId, fileName, onBack, onEdit, storageKey }: Props) {
  const theme = useTheme();

  const isMobile = getIsMobile();

  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scriptData, setScriptData] = useState<any>(null);
  const [currentFileName, setCurrentFileName] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingScript, setLoadingScript] = useState(false);

  const [revealedLines, setRevealedLines] = useState<Record<string, boolean>>({});
  const [allRevealed, setAllRevealed] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [playOrder, setPlayOrder] = useState<number[]>([]);
  const [audioReady, setAudioReady] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [autoPlay, setAutoPlay] = useState(() => {
    if (typeof window !== 'undefined') {
      const key = storageKey === 'listening' ? 'opic-auto-play-listening' : 'opic-auto-play';
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

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
  } = useOpicSpeech();

  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const [testResults, setTestResults] = useState<Record<number, { uWord: string; cWord: string; isCorrect: boolean; masked: string }[]>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});

  const userAnswersRef = useRef(userAnswers);
  const lastListeningIndexRef = useRef<number | null>(null);

  useEffect(() => {
    userAnswersRef.current = userAnswers;
  }, [userAnswers]);

  const handleCheckAnswer = useCallback((index: number, text?: string) => {
    if (!scriptData?.lines?.[index]) return;

    const currentAnswers = userAnswersRef.current;
    const userAnswer = (text !== undefined ? text : (currentAnswers[index] || '')).trim();
    const correctAnswer = (scriptData.lines[index].en || '').trim();
    if (!userAnswer) return;

    const uWords = userAnswer.split(/\s+/);
    const cWords = correctAnswer.split(/\s+/);
    const clean = (str: string) => str?.toLowerCase().replace(/’/g, "'").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") || "";
    const uClean = uWords.map(clean);
    const cClean = cWords.map(clean);

    const dp = Array(uClean.length + 1).fill(0).map(() => Array(cClean.length + 1).fill(0));
    for (let i = 1; i <= uClean.length; i++) {
      for (let j = 1; j <= cClean.length; j++) {
        if (uClean[i - 1] === cClean[j - 1] && uClean[i - 1] !== "") dp[i][j] = dp[i - 1][j - 1] + 1;
        else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    const results: any[] = [];
    let i = uClean.length; let j = cClean.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && uClean[i - 1] === cClean[j - 1] && uClean[i - 1] !== "") {
        results.unshift({ uWord: uWords[i - 1], cWord: cWords[j - 1], isCorrect: true, masked: cWords[j - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        results.unshift({ uWord: "", cWord: cWords[j - 1], isCorrect: false, masked: cWords[j - 1].replace(/[a-zA-Z0-9]/g, "*") });
        j--;
      } else {
        results.unshift({ uWord: uWords[i - 1], cWord: "", isCorrect: false, masked: "" });
        i--;
      }
    }
    setTestResults(prev => ({ ...prev, [index]: results }));
    if (results.every(r => r.isCorrect)) setRevealedAnswers(prev => ({ ...prev, [index]: true }));

    // Scroll into view if it's the last script to ensure results are visible
    if (index === (scriptData?.lines?.length || 0) - 1) {
      setTimeout(() => {
        const input = inputRefs.current[index];
        if (input) {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [scriptData?.lines, inputRefs]);

  // Auto-check answer when microphone input ends
  useEffect(() => {
    if (isListening !== null) {
      lastListeningIndexRef.current = isListening;
    } else if (lastListeningIndexRef.current !== null) {
      const indexToCheck = lastListeningIndexRef.current;
      lastListeningIndexRef.current = null;

      setTimeout(() => {
        handleCheckAnswer(indexToCheck);
      }, 300);
    }
  }, [isListening, handleCheckAnswer]);

  // Pre-load voices
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => { window.speechSynthesis.getVoices(); };
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, []);

  // 1. Load Playlist
  useEffect(() => {
    const loadPlaylist = async () => {
      setLoading(true);
      try {
        const data = await getFileScript(fileId, storageKey);
        const playlistWithDefaults = data && data.fileIds ? {
          ...data,
          audioUrlPriority: data.audioUrlPriority ?? true,
          randomPlay: data.randomPlay ?? false,
          playQuestion: data.playQuestion ?? true,
        } : {
          fileIds: [fileId],
          audioUrlPriority: true,
          randomPlay: false,
          playQuestion: true,
        };

        const ids = playlistWithDefaults.fileIds;
        let order = Array.from({ length: ids.length }, (_, i) => i);

        if (playlistWithDefaults.randomPlay && ids.length > 1) {
          // Fisher-Yates Shuffle
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }
        }

        setPlayOrder(order);
        setPlaylist(playlistWithDefaults);
        setCurrentIndex(0);

        // Ensure testMode is TRUE for listening mode to enable blur/reveal
        if (storageKey === 'listening') {
          setTestMode(true);
        }
      } catch (error) {
        console.error('Failed to load playlist', error);
      } finally {
        setLoading(false);
      }
    };
    loadPlaylist();
  }, [fileId, storageKey]);

  // 2. Load Current Script
  useEffect(() => {
    const loadCurrentScript = async () => {
      if (!playlist || playlist.fileIds.length === 0 || playOrder.length === 0) return;

      const currentFileIdx = playOrder[currentIndex];
      const currentId = playlist.fileIds[currentFileIdx];
      setLoadingScript(true);
      setAudioReady(false);
      setIsSwitching(true);
      sequenceRef.current = 'idle';

      // Reset item-specific states when switching scripts
      setRevealedLines({});
      setAllRevealed(false);
      setUserAnswers({});
      setTestResults({});
      setRevealedAnswers({});
      setRecordedAudios({});

      try {
        const data = await getFileScript(currentId);

        // Try current section tree first, then main DRIVE tree
        const treeSection = await getTreeData(storageKey);
        const treeMain = await getTreeData();

        const findName = (nodes: any[]): string => {
          for (const node of nodes) {
            if (node.id === currentId) return node.label;
            if (node.children) {
              const res = findName(node.children);
              if (res) return res;
            }
          }
          return '';
        };

        const nameFromSection = findName(treeSection);
        if (nameFromSection) {
          setCurrentFileName(nameFromSection);
        } else {
          const nameFromMain = findName(treeMain);
          setCurrentFileName(nameFromMain || 'Untitled');
        }

        if (data && !data.questions && (data.questionEn || data.question)) {
          data.questions = [{
            en: data.questionEn || data.question || '',
            ko: data.questionKo || ''
          }];
        }
        setScriptData(data);
      } catch (error) {
        console.error('Failed to load script', error);
        toast.error('스크립트를 불러오는데 실패했습니다.');
      } finally {
        setLoadingScript(false);
        // Delay clearing switching flag slightly to ensure UI and effects settle
        setTimeout(() => {
          setIsSwitching(false);
        }, 300);
      }
    };
    loadCurrentScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist, currentIndex, playOrder]);

  const [currentLineIndex, setCurrentLineIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const domAudioRef = useRef<HTMLAudioElement | null>(null);
  const sequenceRef = useRef<'idle' | 'question' | 'content'>('idle');
  const playingRef = useRef<HTMLDivElement | null>(null);

  // Use refs to avoid stale closures in callbacks
  const playlistRef = useRef<PlaylistData | null>(null);
  const currentIndexRef = useRef(currentIndex);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    if (playingRef.current) {
      playingRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [speakingIndex, currentLineIndex, isAudioPlaying]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const handleNextPlaylist = useCallback(() => {
    const currentPlaylist = playlistRef.current;
    if (!currentPlaylist) return;

    const { fileIds } = currentPlaylist;
    if (fileIds.length <= 1) return;

    setCurrentLineIndex(null); // Reset line index
    setCurrentIndex((prev) => (prev + 1) % fileIds.length);
  }, []);


  const playLine = useCallback((index: number) => {
    if (!scriptData || !scriptData.lines || index >= scriptData.lines.length) {
      return;
    }

    setCurrentLineIndex(index);
    const line = scriptData.lines[index];
    toggleSpeak(line.en, `auto-content-line-${index}`);
  }, [scriptData, toggleSpeak]);

  const playContent = useCallback(() => {
    if (!scriptData) return;

    // Stop any existing speech/audio before starting
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsAudioPlaying(false);

    sequenceRef.current = 'content';

    const useAudioUrl = !!(playlist?.audioUrlPriority && scriptData.audioUrl);

    if (useAudioUrl) {
      // Use the actual DOM audio element if available
      const audio = domAudioRef.current;
      if (audio) {
        try {
          // If already playing or paused in the middle, just play (resume)
          // audio.currentTime will stay at its current position if we don't reset it
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn("Audio play prevented or failed", error);
              // If play fails (e.g. source error), fallback to speech
              playLine(0);
            });
          }
        } catch (err) {
          console.warn("Audio playback failed", err);
          playLine(0);
        }
      } else {
        // Fallback to legacy behavior if DOM element is not yet available
        try {
          const fallbackAudio = new Audio(scriptData.audioUrl);
          audioRef.current = fallbackAudio;
          setIsAudioPlaying(true);

          fallbackAudio.onended = () => {
            audioRef.current = null;
            setIsAudioPlaying(false);
            sequenceRef.current = 'idle';
            if (storageKey === 'listening' && autoPlay) {
              setTimeout(() => {
                handleNextPlaylist();
              }, 1000);
            }
          };

          fallbackAudio.onerror = (e) => {
            console.warn('Audio play failed, falling back to speech', e);
            audioRef.current = null;
            setIsAudioPlaying(false);
            playLine(0);
          };

          const playPromise = fallbackAudio.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn("Audio play prevented or failed", error);
              if (audioRef.current === fallbackAudio) {
                fallbackAudio.onerror?.(error as any);
              }
            });
          }
        } catch (err) {
          console.warn("Audio creation failed", err);
          setIsAudioPlaying(false);
          playLine(0);
        }
      }
    } else {
      playLine(0);
    }
  }, [scriptData, playlist, autoPlay, storageKey, handleNextPlaylist, playLine]);

  const playQuestion = useCallback(() => {
    if (!scriptData) return;

    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const questionText = scriptData.questions?.[0]?.en;
    if (!questionText || playlist?.playQuestion === false) {
      playContent();
      return;
    }

    sequenceRef.current = 'question';
    toggleSpeak(questionText, 'auto-question');
  }, [scriptData, playContent, toggleSpeak]);

  // Effect to start sequence when script changes
  useEffect(() => {
    if (!loadingScript && scriptData && autoPlay && storageKey === 'listening' && !isSwitching) {
      // If we were already in a sequence (from a manual pause/resume), don't reset to question
      if (sequenceRef.current === 'idle') {
        playQuestion();
      }
    } else if (!loadingScript && scriptData && autoPlay && !isSwitching) {
      // Legacy autoPlay behavior for other modes
      const firstQuestion = scriptData.questions?.[0]?.en;
      if (firstQuestion) {
        toggleSpeak(firstQuestion, 'auto-play');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptData, loadingScript, autoPlay, storageKey, isSwitching]);

  // Effect to monitor speech end for sequence transitions
  useEffect(() => {
    // Only trigger when speakingIndex becomes null (speech ended)
    if (speakingIndex === null && storageKey === 'listening' && autoPlay) {
      if (sequenceRef.current === 'question') {
        // Transition Question -> Content
        sequenceRef.current = 'idle';
        setTimeout(() => {
          playContent();
        }, 800);
      } else if (sequenceRef.current === 'content' && !audioRef.current) {
        // Handle next line for Web Speech
        // Use the current state value, but since this effect is triggered by speakingIndex,
        // it will only fire when a speech ends.
        if (currentLineIndex !== null) {
          const nextLineIndex = currentLineIndex + 1;
          // Important: Reset currentLineIndex to null if we've reached the end
          // to prevent the "idle" state from being confused.
          if (scriptData?.lines && nextLineIndex >= scriptData.lines.length) {
            sequenceRef.current = 'idle';
            setCurrentLineIndex(null);
            setTimeout(() => {
              handleNextPlaylist();
            }, 1200);
          } else {
            setTimeout(() => {
              playLine(nextLineIndex);
            }, 500);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakingIndex, storageKey, autoPlay]); // Removed currentLineIndex and other deps that cause re-triggers

  // Reset sequence when index changes manually
  useEffect(() => {
    sequenceRef.current = 'idle';
    setCurrentLineIndex(null);
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (domAudioRef.current) {
      domAudioRef.current.pause();
    }
  }, [currentIndex]);

  // Stop playback when autoPlay is turned off
  useEffect(() => {
    if (!autoPlay && storageKey === 'listening') {
      window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsAudioPlaying(false);
      }
      if (domAudioRef.current) {
        domAudioRef.current.pause();
        setIsAudioPlaying(false);
      }
      sequenceRef.current = 'idle';
      setCurrentLineIndex(null);
    }
  }, [autoPlay, storageKey]);

  // Cleanup audio and speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (domAudioRef.current) {
        domAudioRef.current.pause();
      }
    };
  }, []);

  // 4. Persist Auto Play
  useEffect(() => {
    const key = storageKey === 'listening' ? 'opic-auto-play-listening' : 'opic-auto-play';
    localStorage.setItem(key, JSON.stringify(autoPlay));
  }, [autoPlay, storageKey]);

  const handleNext = useCallback(() => {
    if (playlist && playlist.fileIds.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % playlist.fileIds.length);
    }
  }, [playlist]);

  const handlePrev = useCallback(() => {
    if (playlist && playlist.fileIds.length > 1) {
      setCurrentIndex((prev) => (prev - 1 + playlist.fileIds.length) % playlist.fileIds.length);
    }
  }, [playlist]);

  const toggleLine = useCallback((index: string | number) => {
    setRevealedLines((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const toggleAll = useCallback(() => {
    const newState = !allRevealed;
    setAllRevealed(newState);

    const newRevealedLines: Record<string, boolean> = {};
    const newRevealedAnswers: Record<number, boolean> = {};

    if (scriptData?.lines) {
      scriptData.lines.forEach((_: any, index: number) => {
        newRevealedLines[index.toString()] = newState;
        newRevealedAnswers[index] = newState;
      });
    }
    if (scriptData?.questions) {
      scriptData.questions.forEach((_: any, index: number) => {
        newRevealedLines[`q-en-${index}`] = newState;
        newRevealedLines[`q-ko-${index}`] = newState;
      });
    }
    setRevealedLines(newRevealedLines);
    setRevealedAnswers(newRevealedAnswers);
  }, [allRevealed, scriptData]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        if (event.key === 'ArrowLeft') {
          handlePrev();
        } else {
          handleNext();
        }
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        toggleAll();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        onEdit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onEdit, toggleAll]);


  const handleChangeAnswer = useCallback((index: number, value: string) => {
    setUserAnswers((prev) => (prev[index] === value ? prev : { ...prev, [index]: value }));
  }, [setUserAnswers]);

  const handleToggleAnswerReveal = useCallback((index: number) => {
    setRevealedAnswers(prev => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const setInputRef = useCallback((index: number, el: any) => {
    inputRefs.current[index] = el;
  }, [inputRefs]);

  const handleFocusNextInput = useCallback((index: number, direction: 'next' | 'prev') => {
    const nextIndex = direction === 'next' ? index + 1 : index - 1;
    const nextInput = inputRefs.current[nextIndex];
    if (nextInput) {
      nextInput.focus();
      nextInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [inputRefs]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Typography variant="h6" color="text.secondary">Loading playlist...</Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth={false} sx={{ py: { xs: 2, md: 5 }, px: { xs: 1.5, md: 8 } }}>
      <OpicHeader
        fileName={fileName}
        currentIndex={currentIndex}
        totalFiles={playlist?.fileIds.length || 0}
        currentFileName={currentFileName}
        autoPlay={autoPlay}
        isAudioPlaying={isAudioPlaying}
        isContentSequence={sequenceRef.current === 'content'}
        storageKey={storageKey}
        allRevealed={allRevealed}
        onBack={onBack}
        onPrev={handlePrev}
        onNext={handleNext}
        onToggleAllRevealed={toggleAll}
        onEdit={onEdit}
        onToggleAutoPlay={() => {
          const newAutoPlay = !autoPlay;
          setAutoPlay(newAutoPlay);
          if (newAutoPlay && storageKey === 'listening') {
            if (sequenceRef.current === 'question') playQuestion();
            else if (sequenceRef.current === 'content') playContent();
            else (playlist?.playQuestion === false ? playContent() : playQuestion());
          }
        }}
      />

      <Box>
        {loadingScript ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh' }}>
            <Typography variant="body1" color="text.secondary">Loading script details...</Typography>
          </Box>
        ) : scriptData ? (
          <Stack spacing={4}>
            <OpicQuestionSection
              questions={scriptData?.questions}
              speakingIndex={speakingIndex}
              sequence={sequenceRef.current}
              autoPlay={autoPlay}
              testMode={testMode}
              storageKey={storageKey}
              revealedLines={revealedLines}
              onToggleSpeak={toggleSpeak}
              onToggleReveal={toggleLine}
              playingRef={playingRef}
              audioRef={domAudioRef}
              audioUrl={scriptData?.audioUrl}
              audioReady={audioReady}
              onAudioCanPlay={() => setAudioReady(true)}
              onAudioError={() => {
                setAudioReady(false);
                if (sequenceRef.current === 'content') {
                  setIsAudioPlaying(false);
                  playLine(0);
                }
              }}
              onAudioPlay={() => setIsAudioPlaying(true)}
              onAudioPause={() => setIsAudioPlaying(false)}
              onAudioEnded={() => {
                setIsAudioPlaying(false);
                if (!isSwitching && sequenceRef.current === 'content' && autoPlay && storageKey === 'listening') {
                  sequenceRef.current = 'idle';
                  setTimeout(() => {
                    handleNextPlaylist();
                  }, 1000);
                }
              }}
            />

            {/* Script Lines */}
            <Stack spacing={2.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Script</Typography>
                <Typography variant="caption" sx={{ color: testMode ? 'info.main' : 'text.disabled', fontWeight: 'bold' }}>
                  {testMode ? 'TEST MODE' : '* Click to reveal English'}
                </Typography>
              </Stack>

              {scriptData?.lines?.map((line: any, index: number) => (
                <OpicScriptItem
                  key={index}
                  index={index}
                  line={line}
                  testMode={testMode || storageKey === 'listening'}
                  isRevealed={revealedLines[index]}
                  userAnswer={userAnswers[index]}
                  result={testResults[index]}
                  isAnswerRevealed={revealedAnswers[index]}
                  isListening={isListening === index}
                  isPreparing={isPreparing}
                  playingIndex={playingIndex === index}
                  speakingIndex={speakingIndex === `line-${index}` || speakingIndex === `line-result-${index}` || speakingIndex === `line-view-${index}` || (currentLineIndex === index && !isAudioPlaying && (speakingIndex === `auto-content-line-${index}` || speakingIndex === 'auto-content'))}
                  isMobile={isMobile}
                  recordedAudio={recordedAudios[index]}
                  setInputRef={setInputRef}
                  itemRef={(currentLineIndex === index && !isAudioPlaying && (speakingIndex === `auto-content-line-${index}` || speakingIndex === 'auto-content')) ? playingRef : null}
                  onToggleLine={toggleLine}
                  onToggleSpeak={toggleSpeak}
                  onChangeAnswer={handleChangeAnswer}
                  onCheckAnswer={handleCheckAnswer}
                  onStartListening={startListening}
                  onStopListening={stopListening}
                  onPlayRecordedAudio={playRecordedAudio}
                  onToggleAnswerReveal={handleToggleAnswerReveal}
                  onFocusNext={handleFocusNextInput}
                  hideInput={storageKey === 'listening'}
                />
              ))}
            </Stack>
          </Stack>
        ) : (
          <Box sx={{ py: 10, textAlign: 'center', bgcolor: 'background.neutral', borderRadius: 2 }}>
            <DescriptionIcon sx={{ color: 'text.disabled', mb: 2, width: 48, height: 48 }} />
            <Typography variant="body1" sx={{ color: 'text.disabled' }}>스크립트 정보가 없습니다.</Typography>
          </Box>
        )}
      </Box>
    </Container>

  );
}

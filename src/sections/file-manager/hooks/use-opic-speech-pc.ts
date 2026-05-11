'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'src/components/snackbar';

// ----------------------------------------------------------------------

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export function useOpicSpeech() {
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [recordedAudios, setRecordedAudios] = useState<Record<number, string>>({});
  const [isListening, setIsListening] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | string | null>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const inputRefs = useRef<Record<number, any>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isManualStopRef = useRef(false);
  const accumulatedTranscriptRef = useRef('');
  const currentSessionTranscriptRef = useRef('');
  const isListeningRef = useRef<number | null>(null);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const stopListening = useCallback(() => {
    isManualStopRef.current = true;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { /* already stopped */ }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) { /* already stopped */ }
      mediaRecorderRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsListening(null);
    setIsPreparing(false);
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    // PC version: fixed 3 seconds
    const timeoutDuration = 3000;
    const timeoutMessage = '3초간 입력이 없어 녹음을 종료합니다.';

    silenceTimerRef.current = setTimeout(() => {
      stopListening();
      toast.info(timeoutMessage);
    }, timeoutDuration);
  }, [stopListening]);

  const setupRecognition = useCallback((index: number) => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;

    recognition.lang = 'en-US';
    recognition.continuous = true; // Desktop is fine with continuous
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(index);
      resetSilenceTimer();
    };

    recognition.onresult = (event: any) => {
      resetSilenceTimer();

      let currentSessionTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        currentSessionTranscript += event.results[i][0].transcript;
      }

      currentSessionTranscriptRef.current = currentSessionTranscript;
      const fullTranscript = (accumulatedTranscriptRef.current + ' ' + currentSessionTranscript).trim();
      
      setUserAnswers((prev) => ({ ...prev, [index]: fullTranscript }));
      
      if (inputRefs.current[index]) {
        inputRefs.current[index].value = fullTranscript;
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error', event.error);
      if (event.error === 'not-allowed') {
        toast.warning('마이크 권한이 거부되었습니다.');
        stopListening();
      }
    };

    recognition.onend = () => {
      if (currentSessionTranscriptRef.current) {
        accumulatedTranscriptRef.current = (accumulatedTranscriptRef.current + ' ' + currentSessionTranscriptRef.current).trim();
        currentSessionTranscriptRef.current = '';
      }

      if (!isManualStopRef.current && isListeningRef.current === index) {
        try {
          recognition.start();
        } catch (e) {
          console.warn('Speech recognition restart failed', e);
        }
      }
    };

    return recognition;
  }, [resetSilenceTimer, stopListening]);

  const startListening = useCallback((index: number) => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      toast.warning('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 혹은 Safari 최신 버전을 사용해주세요.');
      return;
    }

    isManualStopRef.current = false;
    accumulatedTranscriptRef.current = '';
    currentSessionTranscriptRef.current = '';

    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch (e) { } }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch (e) { } }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) window.speechSynthesis.cancel();

    setIsPreparing(true);

    // =========================================================
    // 데스크톱 경로: SpeechRecognition + MediaRecorder 동시 사용
    // =========================================================
    const initializeRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        if (isManualStopRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);
            setRecordedAudios((prev) => {
              if (prev[index]) URL.revokeObjectURL(prev[index]);
              return { ...prev, [index]: audioUrl };
            });
          }
        };

        const recognition = setupRecognition(index);

        try {
          recognition.start();
        } catch (e) {
          console.error('Recognition start failed', e);
        }

        setTimeout(() => {
          if (isManualStopRef.current || mediaRecorder.state !== 'inactive') return;
          mediaRecorder.start();
          setIsPreparing(false);
          toast.info('준비되었습니다. 말씀해 주세요!');
        }, 500);

      } catch (err) {
        console.warn('Media setup failed', err);
        setIsPreparing(false);
        setIsListening(null);
        toast.warning('마이크 접근 권한을 허용해 주세요.');
      }
    };

    initializeRecording();

  }, [setupRecognition, stopListening]);

  const recordedAudiosRef = useRef<Record<number, string>>({});
  useEffect(() => {
    recordedAudiosRef.current = recordedAudios;
  }, [recordedAudios]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      Object.values(recordedAudiosRef.current).forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) {}
      });
    };
  }, []);

  const recordedAudiosRefInternal = useRef(recordedAudios);
  useEffect(() => {
    recordedAudiosRefInternal.current = recordedAudios;
  }, [recordedAudios]);

  const playingIndexRef = useRef(playingIndex);
  useEffect(() => {
    playingIndexRef.current = playingIndex;
  }, [playingIndex]);

  const speakingIndexRef = useRef(speakingIndex);
  useEffect(() => {
    speakingIndexRef.current = speakingIndex;
  }, [speakingIndex]);

  const playRecordedAudio = useCallback((index: number) => {
    const currentPlaying = playingIndexRef.current;
    if (currentPlaying === index && currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setPlayingIndex(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    const url = recordedAudiosRefInternal.current[index];
    if (url) {
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      setPlayingIndex(index);
      audio.onended = () => {
        setPlayingIndex(null);
        currentAudioRef.current = null;
      };
      audio.play();
    }
  }, []);

  const toggleSpeak = useCallback((text: string, index: number | string) => {
    const currentSpeaking = speakingIndexRef.current;
    if (currentSpeaking === index && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.85;

    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find((v) => v.lang.startsWith('en') && v.name.includes('Google')) ||
                    voices.find((v) => v.lang.startsWith('en')) ||
                    voices[0];
    if (enVoice) utterance.voice = enVoice;

    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    setSpeakingIndex(index);
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  }, []);

  const stopAll = useCallback(() => {
    stopListening();
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPlayingIndex(null);
    setSpeakingIndex(null);
  }, [stopListening]);

  const resetStates = useCallback(() => {
    setUserAnswers({});
    setRecordedAudios((prev) => {
      Object.values(prev).forEach(url => URL.revokeObjectURL(url));
      return {};
    });
    setIsListening(null);
    setPlayingIndex(null);
    setSpeakingIndex(null);
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return {
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
    stopAll,
    resetStates,
  };
}

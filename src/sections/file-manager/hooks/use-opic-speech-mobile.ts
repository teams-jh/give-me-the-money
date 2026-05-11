'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'src/components/snackbar';

// ----------------------------------------------------------------------

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
    webkitAudioContext: any;
  }
}

export function useOpicSpeech() {
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [isListening, setIsListening] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  
  const [speakingIndex, setSpeakingIndex] = useState<number | string | null>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const inputRefs = useRef<Record<number, any>>({});
  
  const isManualStopRef = useRef(false);
  const accumulatedTranscriptRef = useRef('');
  const isListeningRef = useRef<number | null>(null);
  const isFirstStartRef = useRef(true);

  const userAnswersRef = useRef<Record<number, string>>({});
  useEffect(() => {
    userAnswersRef.current = userAnswers;
  }, [userAnswers]);

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
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch (e) { /* 이미 중지됨 */ }
      recognitionRef.current = null;
    }

    setIsListening(null);
    setIsPreparing(false);
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    const timeoutDuration = 3000; // 3초

    silenceTimerRef.current = setTimeout(() => {
      if (isListeningRef.current !== null) {
        stopListening();
        toast.info('3초간 입력이 없어 종료합니다.');
      }
    }, timeoutDuration);
  }, [stopListening]);

  const startListening = useCallback((index: number) => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      toast.warning('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    isManualStopRef.current = false;
    accumulatedTranscriptRef.current = '';
    isFirstStartRef.current = true;
    
    if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) window.speechSynthesis.cancel();

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    // 🌟 핵심: continuous = false → 한 발화씩 깔끔하게 캡처 (중복 방지)
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(index);
      setIsPreparing(false);
      
      // 🌟 핵심: 처음 시작할 때만 타이머 시작. 
      // 이후에는 onresult(발화 감지) 시에만 타이머가 갱신됩니다.
      // 이렇게 해야 브라우저의 자동 재시작이 타이머를 무한 연장하는 것을 방지합니다.
      if (isFirstStartRef.current) {
        resetSilenceTimer();
        isFirstStartRef.current = false;
      }
    };

    recognition.onresult = (event: any) => {
      resetSilenceTimer(); 
      
      // continuous=false이므로 보통 result는 하나입니다.
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const trimmedTranscript = transcript.trim();

      if (result.isFinal) {
        // 최종 결과: 중복 방지를 위해 기존 누적 텍스트와 비교 후 저장
        const currentAcc = accumulatedTranscriptRef.current.trim();
        if (trimmedTranscript && !currentAcc.toLowerCase().endsWith(trimmedTranscript.toLowerCase())) {
          accumulatedTranscriptRef.current = (accumulatedTranscriptRef.current + ' ' + transcript).trim();
        }
        
        const fullText = accumulatedTranscriptRef.current;
        setUserAnswers((prev) => ({ ...prev, [index]: fullText }));
        if (inputRefs.current[index]) {
          inputRefs.current[index].value = fullText;
        }
      } else {
        // 중간 결과: 현재까지의 확정본 + 현재 분석 중인 단어
        const fullText = (accumulatedTranscriptRef.current + ' ' + transcript).trim();
        setUserAnswers((prev) => ({ ...prev, [index]: fullText }));
        if (inputRefs.current[index]) {
          inputRefs.current[index].value = fullText;
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        // no-speech는 재시작 시도 (자동 종료 방지)
        return;
      }
      if (event.error === 'not-allowed') {
        toast.error('마이크 권한이 거부되었습니다.');
        stopListening();
      }
    };

    recognition.onend = () => {
      // continuous=false → 발화 하나 끝나면 자동으로 onend 호출
      // 수동 종료가 아니면 다음 발화를 위해 재시작
      if (!isManualStopRef.current && isListeningRef.current === index) {
        try { recognition.start(); } catch (e) {}
      }
    };

    try {
      recognition.start();
      setIsPreparing(true);
      if (inputRefs.current[index]) {
        inputRefs.current[index].focus();
      }
    } catch (err) {
      console.error('Recognition start failed:', err);
      toast.error('음성 인식 시작에 실패했습니다.');
    }
  }, [resetSilenceTimer, stopListening]);

  const speakingIndexRef = useRef(speakingIndex);
  useEffect(() => {
    speakingIndexRef.current = speakingIndex;
  }, [speakingIndex]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
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
    utterance.onend = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopAll = useCallback(() => {
    stopListening();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingIndex(null);
  }, [stopListening]);

  const resetStates = useCallback(() => {
    setUserAnswers({});
    setIsListening(null);
    setSpeakingIndex(null);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return {
    userAnswers,
    setUserAnswers,
    recordedAudios: {} as Record<number, string>,
    setRecordedAudios: (val: any) => {},
    isListening,
    isPreparing,
    playingIndex: null as number | null,
    speakingIndex,
    inputRefs,
    startListening,
    stopListening,
    playRecordedAudio: (index: number) => {},
    toggleSpeak,
    stopAll,
    resetStates,
  };
}
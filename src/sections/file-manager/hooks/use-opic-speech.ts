'use client';

import { useState, useEffect, useMemo } from 'react';
import { useOpicSpeech as usePC } from './use-opic-speech-pc';
import { useOpicSpeech as useMobile } from './use-opic-speech-mobile';

export function useOpicSpeech() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  // 두 훅을 모두 호출합니다 (Hooks 규칙 준수).
  // 환경에 따라 한 쪽의 결과물만 반환하여 외부에서는 동일한 인터페이스로 사용할 수 있게 합니다.
  const pc = usePC();
  const mobile = useMobile();

  const result = useMemo(() => (isMobile ? mobile : pc), [isMobile, mobile, pc]);
  
  return { ...result, isMobile };
}

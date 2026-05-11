// import { toast } from 'src/components/snackbar';

export const getIsMobile = () => {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent;
  const isMobileUA =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent
    );

  // iOS 13+ iPad detection (which defaults to Desktop mode)
  // @ts-ignore
  const isIPad = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || 
                 (userAgent.includes('Macintosh') && 'ontouchend' in document);

  // Check for PWA standalone mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  // Check for touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Fallback check for screen size (common mobile breakpoints)
  const isSmallScreen = window.innerWidth <= 768;

  // Consider mobile if:
  // 1. User Agent matches mobile
  // 2. It's an iPad (even in Desktop mode)
  // 3. It's a PWA (standalone)
  // 4. It has touch AND is a small screen (covers most mobile/tablet cases)
  return isMobileUA || isIPad || isStandalone || (hasTouch && isSmallScreen);
};

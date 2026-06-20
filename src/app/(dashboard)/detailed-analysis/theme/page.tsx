import { CONFIG } from 'src/global-config';

import { ThemeAnalysisView } from 'src/sections/detailed-analysis/view/theme-analysis-view';

// ----------------------------------------------------------------------

export const metadata = {
  title: `테마 분석 | ${CONFIG.appName}`,
};

export default function Page() {
  return <ThemeAnalysisView />;
}

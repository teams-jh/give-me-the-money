import { CONFIG } from 'src/global-config';

import { DivergenceAnalysisView } from 'src/sections/detailed-analysis/view/divergence-analysis-view';

// ----------------------------------------------------------------------

export const metadata = {
  title: `괴리율 분석 | ${CONFIG.appName}`,
};

export default function Page() {
  return <DivergenceAnalysisView />;
}

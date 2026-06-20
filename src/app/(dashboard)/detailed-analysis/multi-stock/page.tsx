import { CONFIG } from 'src/global-config';

import { MultiStockAnalysisView } from 'src/sections/detailed-analysis/view/multi-stock-analysis-view';

// ----------------------------------------------------------------------

export const metadata = {
  title: `다중 종목 분석 | ${CONFIG.appName}`,
};

export default function Page() {
  return <MultiStockAnalysisView />;
}

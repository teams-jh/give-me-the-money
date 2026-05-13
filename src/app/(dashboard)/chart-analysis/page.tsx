import { CONFIG } from 'src/global-config';
import { ChartAnalysisView } from 'src/sections/chart-analysis/view/chart-analysis-view';

// ----------------------------------------------------------------------

export const metadata = { title: `차트 분석 - ${CONFIG.appName}` };

export default function Page() {
  return <ChartAnalysisView />;
}

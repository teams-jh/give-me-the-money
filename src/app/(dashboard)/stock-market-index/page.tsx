import { CONFIG } from 'src/global-config';

import { StockMarketIndexView } from 'src/sections/stock-market-index/view';

// ----------------------------------------------------------------------

export const metadata = { title: `주가지수 추세 분석 - ${CONFIG.appName}` };

export default function Page() {
  return <StockMarketIndexView />;
}

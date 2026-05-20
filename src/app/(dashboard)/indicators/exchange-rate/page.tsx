import { CONFIG } from 'src/global-config';

import { ExchangeRateView } from 'src/sections/indicators';

// ----------------------------------------------------------------------

export const metadata = {
  title: `실시간 환율 조회 및 분석 - ${CONFIG.appName}`,
};

export default function Page() {
  return <ExchangeRateView />;
}

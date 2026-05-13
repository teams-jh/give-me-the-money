import { CONFIG } from 'src/global-config';
import { Top100View } from 'src/sections/top100/view/top100-view';

// ----------------------------------------------------------------------

export const metadata = { title: `미국 TOP 100 추세 분석 - ${CONFIG.appName}` };

export default function Page() {
  return <Top100View />;
}

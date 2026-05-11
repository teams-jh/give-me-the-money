import type { Metadata } from 'next';

import { CONFIG } from 'src/global-config';

import { RandomOpicTestView } from 'src/sections/practice/view';

// ----------------------------------------------------------------------

export const metadata: Metadata = { title: `랜덤 모의고사 | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return <RandomOpicTestView />;
}

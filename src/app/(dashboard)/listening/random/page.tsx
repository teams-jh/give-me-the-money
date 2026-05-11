import type { Metadata } from 'next';

import { CONFIG } from 'src/global-config';

import { ListeningRandomView } from 'src/sections/listening/view';

// ----------------------------------------------------------------------

export const metadata: Metadata = { title: `랜덤 듣기 | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return <ListeningRandomView />;
}

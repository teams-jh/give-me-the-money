import type { Metadata } from 'next';

import { CONFIG } from 'src/global-config';

import { FileTestView } from 'src/sections/file-manager/view/file-test-view';

// ----------------------------------------------------------------------

export const metadata: Metadata = { title: `내 모의고사 | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return <FileTestView title="내 모의고사" category="practice" />;
}

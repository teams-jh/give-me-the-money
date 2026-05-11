import type { Metadata } from 'next';

import { CONFIG } from 'src/global-config';

import { FileTestView } from 'src/sections/file-manager/view/file-test-view';

// ----------------------------------------------------------------------

export const metadata: Metadata = { title: `Playlist | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return <FileTestView title="Playlist" category="listening" />;
}

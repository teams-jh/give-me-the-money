import type { Metadata } from 'next';

import { CONFIG } from 'src/global-config';

import { FileManagerView } from 'src/sections/file-manager/view';

// ----------------------------------------------------------------------

export const metadata: Metadata = { title: `Opic Drive - ${CONFIG.appName}` };

export default function Page() {
  return <FileManagerView />;
}

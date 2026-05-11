import type { Metadata } from 'next';

import { CONFIG } from 'src/global-config';
import { DashboardHomeView } from 'src/sections/home/view/dashboard-home-view';

// ----------------------------------------------------------------------

export const metadata: Metadata = { title: `Home | Dashboard - ${CONFIG.appName}` };

export default function Page() {
  return <DashboardHomeView />;
}

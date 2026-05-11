import type { Metadata } from 'next';

import { HomeView } from 'src/sections/home/view';

// ----------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'AL is well',
  description:
    '오픽 스크립트 암기 노트',
};

export default function Page() {
  return <HomeView />;
}

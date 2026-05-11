import type { Metadata } from 'next';

import { HomeView } from 'src/sections/home/view';

// ----------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Give Me The Money - 스마트 주식 투자 어드바이저',
  description:
    '당신의 자산을 극대화하는 스마트한 주식 투자 전략, Give Me The Money와 함께하세요.',
};

export default function Page() {
  return <HomeView />;
}

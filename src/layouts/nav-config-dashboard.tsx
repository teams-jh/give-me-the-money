import type { NavMainProps } from './main/nav/types';
import type { NavSectionProps } from 'src/components/nav-section';

import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import LeaderboardRoundedIcon from '@mui/icons-material/LeaderboardRounded';

import { paths } from 'src/routes/paths';

const ICONS = {
  top100: <LeaderboardRoundedIcon fontSize="small" />,
  detailed: <AnalyticsRoundedIcon fontSize="small" />,
  indicators: <TrendingUpRoundedIcon fontSize="small" />,

  home: <HomeRoundedIcon fontSize="small" />,
};

// ----------------------------------------------------------------------

/**
 * Input nav data is an array of navigation section items used to define the structure and content of a navigation bar.
 * Each section contains a subheader and an array of items, which can include nested children items.
 *
 * Each item can have the following properties:
 * - `title`: The title of the navigation item.
 * - `path`: The URL path the item links to.
 * - `icon`: An optional icon component to display alongside the title.
 * - `info`: Optional additional information to display, such as a label.
 * - `allowedRoles`: An optional array of roles that are allowed to see the item.
 * - `caption`: An optional caption to display below the title.
 * - `children`: An optional array of nested navigation items.
 * - `disabled`: An optional boolean to disable the item.
 * - `deepMatch`: An optional boolean to indicate if the item should match subpaths.
 */
export const navData: NavSectionProps['data'] = [
  /**
   * Overview
   */
  {
    subheader: 'Overview',
    items: [
      { title: 'Dashboard', path: paths.dashboard.root, icon: ICONS.home },

      {
        title: '주가지수',
        path: paths.stockMarketIndex,
        icon: ICONS.top100,
      },
      {
        title: '상세 분석',
        path: paths.detailedAnalysis.root,
        icon: ICONS.detailed,
        children: [
          { title: '단일 종목 분석', path: paths.detailedAnalysis.singleStock },
          { title: '다중 종목 분석', path: paths.detailedAnalysis.multiStock },
          { title: '테마 분석', path: paths.detailedAnalysis.theme },
          { title: '적립 투자', path: paths.detailedAnalysis.periodic },
          { title: '추세 추종', path: paths.detailedAnalysis.trendFollowing },
          { title: '차트 추세 분석', path: paths.detailedAnalysis.chartTrend },
        ],
      },
      {
        title: '지표',
        path: paths.indicators.root,
        icon: ICONS.indicators,
        children: [
          { title: '차트 지표', path: paths.indicators.chart },
          { title: '추세 지표', path: paths.indicators.trend },
          { title: '매크로 지표', path: paths.indicators.macro },
          { title: '환율', path: paths.indicators.exchangeRate },
        ],
      },
    ],
  },
];

// ----------------------------------------------------------------------

export const mainNavData: NavMainProps['data'] = [
  { title: 'Home', path: '/', icon: <HomeRoundedIcon sx={{ width: 22, height: 22 }} /> },
  {
    title: 'Dashboard',
    path: paths.dashboard.root,
    icon: <HomeRoundedIcon sx={{ width: 22, height: 22 }} />,
  },
  {
    title: '주가지수',
    path: paths.stockMarketIndex,
    icon: <LeaderboardRoundedIcon sx={{ width: 22, height: 22 }} />,
  },
  {
    title: '상세 분석',
    path: paths.detailedAnalysis.root,
    icon: <AnalyticsRoundedIcon sx={{ width: 22, height: 22 }} />,
    children: [
      {
        subheader: '상세 분석',
        items: [
          { title: '단일 종목 분석', path: paths.detailedAnalysis.singleStock },
          { title: '다중 종목 분석', path: paths.detailedAnalysis.multiStock },
          { title: '테마 분석', path: paths.detailedAnalysis.theme },
          { title: '적립 투자', path: paths.detailedAnalysis.periodic },
          { title: '추세 추종', path: paths.detailedAnalysis.trendFollowing },
          { title: '차트 추세 분석', path: paths.detailedAnalysis.chartTrend },
        ],
      },
    ],
  },
  {
    title: '지표',
    path: paths.indicators.root,
    icon: <TrendingUpRoundedIcon sx={{ width: 22, height: 22 }} />,
    children: [
      {
        subheader: '지표',
        items: [
          { title: '차트 지표', path: paths.indicators.chart },
          { title: '추세 지표', path: paths.indicators.trend },
          { title: '매크로 지표', path: paths.indicators.macro },
          { title: '환율', path: paths.indicators.exchangeRate },
        ],
      },
    ],
  },
];

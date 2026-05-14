import type { NavSectionProps } from 'src/components/nav-section';
import type { NavMainProps } from './main/nav/types';

import { paths } from 'src/routes/paths';

import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import HeadphonesRoundedIcon from '@mui/icons-material/HeadphonesRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';

const ICONS = {
  folder: <FolderRoundedIcon fontSize="small" />,
  practice: <AssignmentRoundedIcon fontSize="small" />,
  listening: <HeadphonesRoundedIcon fontSize="small" />,
  analytics: <TimelineRoundedIcon fontSize="small" />,

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
      { title: 'Asset Drive', path: paths.fileManager, icon: ICONS.folder },
      {
        title: 'Trading',
        path: paths.practice.root,
        icon: ICONS.practice,
        children: [
          { title: 'My Strategy', path: paths.practice.myTests },
          { title: 'Simulation', path: paths.practice.randomTest },
        ],
      },
      {
        title: 'Market',
        path: paths.listening.root,
        icon: ICONS.listening,
        children: [
          { title: 'Watchlist', path: paths.listening.playlist },
          { title: 'Live Updates', path: paths.listening.random },
        ],
      },
      {
        title: '미국 TOP 100 추세 분석',
        path: paths.top100,
        icon: ICONS.analytics,
      },
      {
        title: '차트 분석',
        path: paths.chartAnalysis,
        icon: ICONS.analytics,
      },
      {
        title: '상세 분석',
        path: paths.detailedAnalysis,
        icon: ICONS.analytics,
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
    title: 'Drive',
    path: paths.fileManager,
    icon: <FolderRoundedIcon sx={{ width: 22, height: 22 }} />,
  },
  {
    title: 'Trading',
    path: paths.practice.root,
    icon: <AssignmentRoundedIcon sx={{ width: 22, height: 22 }} />,
    children: [
      {
        subheader: 'Trading',
        items: [
          { title: 'My Strategy', path: paths.practice.myTests },
          { title: 'Simulation', path: paths.practice.randomTest },
        ],
      },
    ],
  },
  {
    title: 'Market',
    path: paths.listening.root,
    icon: <HeadphonesRoundedIcon sx={{ width: 22, height: 22 }} />,
    children: [
      {
        subheader: 'Market',
        items: [
          { title: 'Watchlist', path: paths.listening.playlist },
          { title: 'Live Updates', path: paths.listening.random },
        ],
      },
    ],
  },
  {
    title: '미국 TOP 100 추세 분석',
    path: paths.top100,
    icon: <TimelineRoundedIcon sx={{ width: 22, height: 22 }} />,
  },
  {
    title: '차트 분석',
    path: paths.chartAnalysis,
    icon: <TimelineRoundedIcon sx={{ width: 22, height: 22 }} />,
  },
  {
    title: '상세 분석',
    path: paths.detailedAnalysis,
    icon: <TimelineRoundedIcon sx={{ width: 22, height: 22 }} />,
  },
];

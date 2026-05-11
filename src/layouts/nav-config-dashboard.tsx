import type { NavSectionProps } from 'src/components/nav-section';
import type { NavMainProps } from './main/nav/types';

import { paths } from 'src/routes/paths';

import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import HeadphonesRoundedIcon from '@mui/icons-material/HeadphonesRounded';

const ICONS = {
  folder: <FolderRoundedIcon fontSize="small" />,
  practice: <AssignmentRoundedIcon fontSize="small" />,
  listening: <HeadphonesRoundedIcon fontSize="small" />,

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
      { title: 'Home', path: paths.home, icon: ICONS.home },
      { title: 'Drive', path: paths.fileManager, icon: ICONS.folder },
      {
        title: 'Practice',
        path: paths.practice.root,
        icon: ICONS.practice,
        children: [
          { title: '내 모의고사', path: paths.practice.myTests },
          { title: '랜덤 모의고사', path: paths.practice.randomTest },
        ],
      },
      {
        title: 'Listening',
        path: paths.listening.root,
        icon: ICONS.listening,
        children: [
          { title: 'Playlist', path: paths.listening.playlist },
          { title: '랜덤 듣기', path: paths.listening.random },
        ],
      },

    ],
  },
];

// ----------------------------------------------------------------------

export const mainNavData: NavMainProps['data'] = [
  { title: 'Home', path: '/', icon: <HomeRoundedIcon sx={{ width: 22, height: 22 }} /> },
  {
    title: 'Drive',
    path: paths.fileManager,
    icon: <FolderRoundedIcon sx={{ width: 22, height: 22 }} />,
  },
  {
    title: 'Practice',
    path: paths.practice.root,
    icon: <AssignmentRoundedIcon sx={{ width: 22, height: 22 }} />,
    children: [
      {
        subheader: 'Practice',
        items: [
          { title: '내 모의고사', path: paths.practice.myTests },
          { title: '랜덤 모의고사', path: paths.practice.randomTest },
        ],
      },
    ],
  },
  {
    title: 'Listening',
    path: paths.listening.root,
    icon: <HeadphonesRoundedIcon sx={{ width: 22, height: 22 }} />,
    children: [
      {
        subheader: 'Listening',
        items: [
          { title: 'Playlist', path: paths.listening.playlist },
          { title: '랜덤 듣기', path: paths.listening.random },
        ],
      },
    ],
  },

];

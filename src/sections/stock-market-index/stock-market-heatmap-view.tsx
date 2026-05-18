'use client';

import type { PeriodKey } from './types';

import { useState, useEffect } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Slider from '@mui/material/Slider';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import ToggleButton from '@mui/material/ToggleButton';
import { alpha, useTheme } from '@mui/material/styles';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded';

interface StockMarketHeatmapViewProps {
  currentPeriod: PeriodKey;
  setCurrentPeriod: (period: PeriodKey) => void;
  valueType: 'cumulative' | 'daily';
  setValueType: (type: 'cumulative' | 'daily') => void;
  groupBySector: boolean;
  setGroupBySector: (group: boolean) => void;
  sizeType: 'marketCap' | 'price';
  setSizeType: (type: 'marketCap' | 'price') => void;
  selectedHeatmapSector: string;
  setSelectedHeatmapSector: (sector: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  dateIndex: number;
  setDateIndex: (index: number) => void;
  playSpeed: number;
  setPlaySpeed: (speed: number) => void;
  availableDates: string[];
  treeData: any;
  renderTooltip: (props: any) => React.ReactNode;
  handleOpenModal: (ticker: string) => void;
  thresholds: { strong: number; medium: number; light: number };
  isFullScreen: boolean;
  setIsFullScreen: (fullscreen: boolean) => void;
  sectors: string[];
  selectedIndexId: string;
}

export function StockMarketHeatmapView({
  currentPeriod,
  setCurrentPeriod,
  valueType,
  setValueType,
  groupBySector,
  setGroupBySector,
  sizeType,
  setSizeType,
  selectedHeatmapSector,
  setSelectedHeatmapSector,
  searchQuery,
  setSearchQuery,
  isPlaying,
  setIsPlaying,
  dateIndex,
  setDateIndex,
  playSpeed,
  setPlaySpeed,
  availableDates,
  treeData,
  renderTooltip,
  handleOpenModal,
  thresholds,
  isFullScreen,
  setIsFullScreen,
  sectors,
  selectedIndexId,
}: StockMarketHeatmapViewProps) {
  const theme = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Segmented controls shared styles (26px height)
  const segmentControlGroupStyle = {
    height: 26,
    bgcolor: 'background.neutral',
    p: '2px',
    border: 'none !important',
    borderRadius: 0.5,
    display: 'inline-flex',
    alignItems: 'center',
    '& .MuiToggleButtonGroup-grouped': {
      border: 'none !important',
      '&:not(:first-of-type)': { borderRadius: '4px !important', marginLeft: '0px !important' },
      '&:first-of-type': { borderRadius: '4px !important' }
    },
    '& .MuiToggleButton-root': {
      border: 'none !important',
      borderRadius: '4px !important',
      margin: '0 !important',
      py: 0,
      px: 1.2,
      fontSize: '0.72rem',
      fontWeight: 700,
      color: 'text.secondary',
      height: '22px !important',
      minHeight: '22px !important',
      textTransform: 'none',
      transition: 'all 0.2s',
      boxSizing: 'border-box',
      '&.Mui-selected': {
        bgcolor: 'background.paper',
        color: 'primary.main',
        boxShadow: theme.shadows[1],
        fontWeight: 800,
        '&:hover': { bgcolor: 'background.paper' }
      },
      '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) }
    }
  };

  // Speed segmented controls shared styles (20px height)
  const speedControlGroupStyle = {
    height: 20,
    bgcolor: 'background.neutral',
    p: '2px',
    border: 'none !important',
    borderRadius: 0.5,
    display: 'inline-flex',
    alignItems: 'center',
    '& .MuiToggleButtonGroup-grouped': {
      border: 'none !important',
      '&:not(:first-of-type)': { borderRadius: '3px !important', marginLeft: '0px !important' },
      '&:first-of-type': { borderRadius: '3px !important' }
    },
    '& .MuiToggleButton-root': {
      border: 'none !important',
      borderRadius: '3px !important',
      margin: '0 !important',
      py: 0,
      px: 1,
      fontSize: '0.68rem',
      fontWeight: 700,
      color: 'text.secondary',
      height: '16px !important',
      minHeight: '16px !important',
      textTransform: 'none',
      transition: 'all 0.2s',
      boxSizing: 'border-box',
      '&.Mui-selected': {
        bgcolor: 'background.paper',
        color: 'primary.main',
        boxShadow: theme.shadows[1],
        fontWeight: 800,
        '&:hover': { bgcolor: 'background.paper' }
      },
      '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) }
    }
  };

  const renderControls = () => (
    <Card sx={{ p: 0.75, px: 1.5, borderRadius: 1, bgcolor: 'background.paper', border: `1px solid ${theme.palette.divider}`, boxShadow: theme.shadows[1] }}>
      <Stack spacing={1}>
        
        {/* Row 1: All selectors in one ultra-flat line */}
        <Stack 
          direction="row" 
          alignItems="center" 
          justifyContent="space-between" 
          flexWrap="wrap" 
          gap={1.5}
        >
          {/* Selectors with Inline Labels */}
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" gap={1.2}>
            {/* Period Selector */}
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                기간
              </Typography>
              <ToggleButtonGroup
                value={currentPeriod}
                exclusive
                onChange={(e, v) => v && setCurrentPeriod(v)}
                size="small"
                sx={segmentControlGroupStyle}
              >
                <ToggleButton value="3m">3m</ToggleButton>
                <ToggleButton value="1y">1y</ToggleButton>
                <ToggleButton value="2y">2y</ToggleButton>
                <ToggleButton value="3y">3y</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center' }} />

            {/* Return Selector */}
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                기준
              </Typography>
              <ToggleButtonGroup
                value={valueType}
                exclusive
                onChange={(e, v) => v && setValueType(v)}
                size="small"
                sx={segmentControlGroupStyle}
              >
                <ToggleButton value="cumulative">누적</ToggleButton>
                <ToggleButton value="daily">당일</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center' }} />

            {/* Grouping Selector */}
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                분류
              </Typography>
              <ToggleButtonGroup
                value={groupBySector}
                exclusive
                onChange={(e, v) => v !== null && setGroupBySector(v)}
                size="small"
                sx={segmentControlGroupStyle}
              >
                <ToggleButton value>그룹</ToggleButton>
                <ToggleButton value={false}>통합</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center' }} />

            {/* Size Selector */}
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                크기
              </Typography>
              <ToggleButtonGroup
                value={sizeType}
                exclusive
                onChange={(e, v) => v !== null && setSizeType(v)}
                size="small"
                sx={segmentControlGroupStyle}
              >
                <ToggleButton value="marketCap">시총</ToggleButton>
                <ToggleButton value="price">주가</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ height: 16, alignSelf: 'center' }} />

            {/* Sector Selector */}
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                섹터
              </Typography>
              <TextField
                select
                size="small"
                value={selectedHeatmapSector}
                onChange={(e) => setSelectedHeatmapSector(e.target.value)}
                SelectProps={{ native: true }}
                sx={{
                  height: 26,
                  '& .MuiOutlinedInput-root': {
                    height: 26,
                    borderRadius: 0.5,
                    bgcolor: 'background.neutral',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'text.primary',
                    p: '2px',
                    '& fieldset': { border: 'none' },
                  },
                  '& select': {
                    py: 0,
                    pl: 1,
                    pr: 3,
                    height: 22,
                    borderRadius: 0.35,
                    bgcolor: 'background.neutral',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }
                }}
              >
                <option value="all">전체보기</option>
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </TextField>
            </Stack>
          </Stack>

          {/* Search and Legend Stack */}
          <Stack direction="row" spacing={1.2} alignItems="center" flexWrap="wrap" gap={1}>
            {/* Search Bar */}
            <TextField
              placeholder="종목 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="small"
              sx={{
                width: 130,
                height: 26,
                '& .MuiOutlinedInput-root': {
                  height: 26,
                  borderRadius: 0.5,
                  bgcolor: 'background.neutral',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  p: '2px',
                  '& fieldset': { border: 'none' },
                  '& input': {
                    py: 0,
                    height: 22,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ ml: 0.5 }}>
                    <SearchIcon sx={{ color: 'text.disabled', fontSize: 14 }} />
                  </InputAdornment>
                ),
              }}
            />

            {/* Legend */}
            <Stack direction="row" spacing={0.25} alignItems="center" sx={{ bgcolor: 'background.neutral', px: 0.75, py: 0.25, borderRadius: 0.5, height: 26 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.25, fontWeight: 800, fontSize: '0.62rem' }}>
                변동:
              </Typography>
              <Box sx={{ width: 8, height: 8, bgcolor: '#b71c1c', borderRadius: 0.2 }} />
              <Typography variant="caption" sx={{ mr: 0.25, fontSize: '0.62rem', fontWeight: 700 }}>
                -{thresholds.strong}%
              </Typography>
              <Box sx={{ width: 8, height: 8, bgcolor: '#e53935', borderRadius: 0.2 }} />
              <Box sx={{ width: 8, height: 8, bgcolor: '#ef9a9a', borderRadius: 0.2 }} />
              <Typography variant="caption" sx={{ mr: 0.25, fontSize: '0.62rem', fontWeight: 700 }}>
                0%
              </Typography>
              <Box sx={{ width: 8, height: 8, bgcolor: '#a5d6a7', borderRadius: 0.2 }} />
              <Box sx={{ width: 8, height: 8, bgcolor: '#4caf50', borderRadius: 0.2 }} />
              <Box sx={{ width: 8, height: 8, bgcolor: '#1b5e20', borderRadius: 0.2 }} />
              <Typography variant="caption" sx={{ fontSize: '0.62rem', fontWeight: 700 }}>
                +{thresholds.strong}%
              </Typography>
            </Stack>

            {/* Fullscreen Button */}
            <Tooltip title={isFullScreen ? "전체화면 종료" : "전체화면 보기"}>
              <IconButton
                size="small"
                onClick={() => setIsFullScreen(!isFullScreen)}
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: 0.5,
                  bgcolor: 'background.neutral',
                  color: 'text.secondary',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                  }
                }}
              >
                {isFullScreen ? (
                  <FullscreenExitRoundedIcon sx={{ fontSize: 18 }} />
                ) : (
                  <FullscreenRoundedIcon sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Divider sx={{ borderStyle: 'dotted', my: 0.25 }} />

        {/* Row 2: Timeline Player Slider in ultra-flat row */}
        {availableDates.length > 0 ? (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%', height: 26 }}>
            {/* Controls & Progress info */}
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 160 }}>
              <IconButton
                color="primary"
                size="small"
                onClick={() => setIsPlaying(!isPlaying)}
                sx={{ 
                  width: 24, 
                  height: 24,
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) }
                }}
              >
                {isPlaying ? <PauseRoundedIcon sx={{ fontSize: 16 }} /> : <PlayArrowRoundedIcon sx={{ fontSize: 16 }} />}
              </IconButton>
              
              <IconButton
                color="secondary"
                size="small"
                onClick={() => {
                  setIsPlaying(false);
                  setDateIndex(0);
                }}
                disabled={dateIndex === 0}
                sx={{ 
                  width: 24, 
                  height: 24,
                  bgcolor: alpha(theme.palette.grey[500], 0.1),
                  '&:hover': { bgcolor: alpha(theme.palette.grey[500], 0.2) }
                }}
              >
                <RefreshRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>

              <Box sx={{ minWidth: 90, pl: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 850, color: 'primary.main', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                  {availableDates[dateIndex] || ''}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.62rem' }}>
                  ({(((dateIndex + 1) / availableDates.length) * 100).toFixed(0)}%)
                </Typography>
              </Box>
            </Stack>

            {/* Progress Slider */}
            <Box sx={{ flexGrow: 1, px: 0.5, display: 'flex', alignItems: 'center' }}>
              <Slider
                value={dateIndex}
                min={0}
                max={availableDates.length - 1}
                onChange={(e, v) => {
                  setIsPlaying(false);
                  setDateIndex(v as number);
                }}
                valueLabelFormat={(v) => availableDates[v] || ''}
                valueLabelDisplay="auto"
                sx={{
                  height: 3,
                  py: 0.75,
                  '& .MuiSlider-thumb': {
                    width: 10,
                    height: 10,
                    bgcolor: 'primary.main',
                    '&:hover, &.Mui-focusVisible': {
                      boxShadow: `0px 0px 0px 4px ${alpha(theme.palette.primary.main, 0.16)}`,
                    },
                  },
                  '& .MuiSlider-rail': { bgcolor: 'divider' }
                }}
              />
            </Box>
            
            {/* Speed Toggle */}
            <Box>
              <ToggleButtonGroup
                value={playSpeed}
                exclusive
                onChange={(e, v) => v && setPlaySpeed(v)}
                size="small"
                sx={speedControlGroupStyle}
              >
                <ToggleButton value={400}>Slow</ToggleButton>
                <ToggleButton value={200}>Normal</ToggleButton>
                <ToggleButton value={80}>Fast</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 0.5 }}>
            날짜 데이터를 불러올 수 없습니다.
          </Typography>
        )}
      </Stack>
    </Card>
  );

  const renderTreemap = (height: number) => {
    if (availableDates.length > 0 && dateIndex !== -1 && isMounted) {
      return (
        <Box sx={{ height, width: '100%', position: 'relative', bgcolor: 'background.neutral', borderRadius: 1.5, overflow: 'hidden', p: 1 }}>
          <ResponsiveTreeMap
            data={treeData}
            identity="id"
            value="value"
            valueFormat=""
            margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            labelSkipSize={16}
            label={(node: any) => {
              if (node.data && typeof node.data.activeReturn === 'number') {
                const isKorean = node.id.endsWith('.KS') || node.id.endsWith('.KQ');
                const displayName = isKorean ? (node.data.name || node.id) : node.id;
                return `${displayName} (${node.data.activeReturn >= 0 ? '+' : ''}${node.data.activeReturn.toFixed(1)}%)`;
              }
              return node.id;
            }}
            labelTextColor={(node: any) => {
              if (node.data.children) {
                return theme.palette.text.primary;
              }
              return node.data.textColor || '#ffffff';
            }}
            colors={(node: any) => {
              if (node.data.children) {
                return theme.palette.mode === 'dark' ? '#212b36' : '#f4f6f8';
              }
              return node.data.color || '#cccccc';
            }}
            borderWidth={1.5}
            borderColor={(node: any) => {
              if (node.data.children) {
                return theme.palette.divider;
              }
              return theme.palette.background.paper;
            }}
            parentLabelPosition="top"
            parentLabelSize={24}
            parentLabelTextColor={theme.palette.text.primary}
            nodeOpacity={1}
            tooltip={renderTooltip}
            onClick={(node: any) => {
              if (!node.data.children && node.data.id) {
                handleOpenModal(node.data.id);
              }
            }}
          />
        </Box>
      );
    }
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          데이터를 불러올 수 없거나 렌더링 준비 중입니다.
        </Typography>
      </Box>
    );
  };

  return (
    <Stack spacing={3}>
      {renderControls()}

      <Card sx={{ p: 3, borderRadius: 2 }}>
        {renderTreemap(600)}
      </Card>

      {/* Fullscreen Heatmap Dialog */}
      <Dialog
        open={isFullScreen}
        onClose={() => setIsFullScreen(false)}
        fullScreen
        sx={{
          '& .MuiDialog-paper': {
            bgcolor: 'background.default',
          }
        }}
      >
        <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100vh', gap: 1.5, overflow: 'hidden' }}>
          {renderControls()}
          <Box sx={{ flexGrow: 1, width: '100%', position: 'relative', bgcolor: 'background.neutral', borderRadius: 1.5, overflow: 'hidden', p: 1 }}>
            {renderTreemap('100%') as any}
          </Box>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

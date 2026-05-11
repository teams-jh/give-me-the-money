'use client';

import type { FileThumbnailProps } from './types';

import { mergeClasses } from 'minimal-shared/utils';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';

import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import TableChartIcon from '@mui/icons-material/TableChart';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import ImageIcon from '@mui/icons-material/Image';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderIcon from '@mui/icons-material/Folder';

import { fileThumbnailClasses } from './classes';
import { fileData, fileFormat } from './utils';
import { RemoveButton, DownloadButton } from './action-buttons';

// ----------------------------------------------------------------------

export function FileThumbnail({
  sx,
  file,
  tooltip,
  onRemove,
  imageView,
  slotProps,
  onDownload,
  className,
  ...other
}: FileThumbnailProps) {
  const { icon, removeBtn, downloadBtn, tooltip: tooltipProps } = slotProps ?? {};

  const { name, path } = fileData(file);

  const previewUrl = typeof file === 'string' ? file : URL.createObjectURL(file);

  const format = fileFormat(path ?? previewUrl);

  const renderItem = () => (
    <ItemRoot className={mergeClasses([fileThumbnailClasses.root, className])} sx={sx} {...other}>
      {format === 'image' && imageView ? (
        <ItemImg src={previewUrl} className={fileThumbnailClasses.img} {...slotProps?.img} />
      ) : (
        <ItemIcon className={fileThumbnailClasses.icon} {...icon}>
          {renderIcon(format)}
        </ItemIcon>
      )}

      {onRemove && (
        <RemoveButton
          onClick={onRemove}
          className={fileThumbnailClasses.removeBtn}
          {...removeBtn}
        />
      )}

      {onDownload && (
        <DownloadButton
          onClick={onDownload}
          className={fileThumbnailClasses.downloadBtn}
          {...downloadBtn}
        />
      )}
    </ItemRoot>
  );

  if (tooltip) {
    return (
      <Tooltip
        arrow
        title={name}
        {...tooltipProps}
        slotProps={{
          ...tooltipProps?.slotProps,
          popper: {
            modifiers: [
              {
                name: 'offset',
                options: { offset: [0, -12] },
              },
            ],
            ...tooltipProps?.slotProps?.popper,
          },
        }}
      >
        {renderItem()}
      </Tooltip>
    );
  }

  return renderItem();
}

// ----------------------------------------------------------------------

function renderIcon(format: string) {
  switch (format) {
    case 'pdf':
      return <PictureAsPdfIcon sx={{ color: 'error.main' }} />;
    case 'txt':
    case 'word':
      return <DescriptionIcon sx={{ color: 'primary.main' }} />;
    case 'excel':
      return <TableChartIcon sx={{ color: 'success.main' }} />;
    case 'powerpoint':
      return <SlideshowIcon sx={{ color: 'warning.main' }} />;
    case 'zip':
      return <FolderZipIcon sx={{ color: 'text.secondary' }} />;
    case 'audio':
      return <AudioFileIcon sx={{ color: 'info.main' }} />;
    case 'video':
      return <VideoFileIcon sx={{ color: 'secondary.main' }} />;
    case 'image':
      return <ImageIcon sx={{ color: 'info.main' }} />;
    case 'folder':
      return <FolderIcon sx={{ color: 'warning.main' }} />;
    default:
      return <InsertDriveFileIcon sx={{ color: 'text.disabled' }} />;
  }
}

// ----------------------------------------------------------------------

const ItemRoot = styled('span')(({ theme }) => ({
  width: 36,
  height: 36,
  flexShrink: 0,
  alignItems: 'center',
  position: 'relative',
  display: 'inline-flex',
  justifyContent: 'center',
  borderRadius: Number(theme.shape.borderRadius) * 1.25,
}));

const ItemIcon = styled(Box)(() => ({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& > svg': {
    width: '100%',
    height: '100%',
  },
}));

const ItemImg = styled('img')(() => ({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'inherit',
}));

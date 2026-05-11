import type { DialogProps } from '@mui/material/Dialog';

import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { Upload } from 'src/components/upload';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

// ----------------------------------------------------------------------

import type { TextFieldProps } from '@mui/material/TextField';

// ----------------------------------------------------------------------

type Props = DialogProps & {
  title?: string;
  folderName?: string;
  onClose: () => void;
  onCreate?: (name: string) => void;
  onUpdate?: (name: string) => void;
  hideUpload?: boolean;
  textFieldProps?: TextFieldProps;
  existingItems?: { name: string; type: string }[];
  currentType?: string;
};

export function FileManagerCreateFolderDialog({
  open,
  onClose,
  onCreate,
  onUpdate,
  folderName = '',
  hideUpload,
  textFieldProps,
  existingItems = [],
  currentType,
  title = 'Add files',
  ...other
}: Props) {
  const [files, setFiles] = useState<(File | string)[]>([]);
  const [name, setName] = useState(folderName);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(folderName);
      setError('');
    } else {
      setFiles([]);
    }
  }, [open, folderName]);

  const validate = useCallback(
    (value: string) => {
      const INVALID_CHARACTERS = /[<>:"/\\|?*]/;
      if (!value) return 'Name is required';
      if (INVALID_CHARACTERS.test(value)) return 'Invalid characters: < > : " / \\ | ? *';
      if (
        existingItems.some(
          (item) => item.name.toLowerCase() === value.toLowerCase() && item.type === currentType
        )
      ) {
        return `A ${currentType} with this name already exists`;
      }
      return '';
    },
    [existingItems, currentType]
  );

  const handleChangeName = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setName(value);
      setError(validate(value));
    },
    [validate]
  );

  const handleSubmit = useCallback(() => {
    const err = validate(name);
    if (err) {
      setError(err);
      return;
    }
    if (onUpdate) {
      onUpdate(name);
    } else if (onCreate) {
      onCreate(name);
    }
  }, [name, validate, onCreate, onUpdate]);

  const handleDrop = useCallback(
    (acceptedFiles: File[]) => {
      setFiles([...files, ...acceptedFiles]);
    },
    [files]
  );

  const handleUpload = () => {
    onClose();
    console.info('ON UPLOAD');
  };

  const handleRemoveFile = (inputFile: File | string) => {
    const filtered = files.filter((file) => file !== inputFile);
    setFiles(filtered);
  };

  const handleRemoveAllFiles = () => {
    setFiles([]);
  };

  return (
    <Dialog fullWidth maxWidth="xs" open={open} onClose={onClose} {...other}>
      <DialogTitle sx={{ p: (theme) => theme.spacing(3, 3, 1, 3) }}>{title}</DialogTitle>

      <DialogContent sx={{ p: (theme) => theme.spacing(0, 3, 2, 3) }}>
        {(onCreate || onUpdate) && (
          <TextField
            fullWidth
            autoFocus
            value={name}
            onChange={handleChangeName}
            onKeyUp={(event) => {
              if (event.key === 'Enter') {
                handleSubmit();
              }
            }}
            error={!!error}
            helperText={error}
            {...textFieldProps}
            sx={{ mt: 1 }}
          />
        )}

        {!hideUpload && (
          <Upload
            multiple
            value={files}
            onDrop={handleDrop}
            onRemove={handleRemoveFile}
            sx={{ mt: (onCreate || onUpdate) ? 2 : 0 }}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ p: (theme) => theme.spacing(1, 3, 3, 3) }}>
        {!hideUpload && (
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={handleUpload}
          >
            Upload
          </Button>
        )}

        {!!files.length && (
          <Button variant="outlined" color="inherit" onClick={handleRemoveAllFiles}>
            Remove all
          </Button>
        )}

        {(onCreate || onUpdate) && (
          <Button variant="contained" color="inherit" onClick={handleSubmit}>
            {onUpdate ? 'Save' : 'Create'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

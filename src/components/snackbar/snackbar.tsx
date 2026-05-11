'use client';

import Portal from '@mui/material/Portal';

import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import { SnackbarRoot } from './styles';
import { snackbarClasses } from './classes';

// ----------------------------------------------------------------------

export function Snackbar() {
  return (
    <Portal>
      <SnackbarRoot
        expand
        closeButton
        gap={12}
        offset={16}
        visibleToasts={4}
        position="top-right"
        className={snackbarClasses.root}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast: snackbarClasses.toast,
            icon: snackbarClasses.icon,
            loader: snackbarClasses.loader,
            loading: snackbarClasses.loading,
            /********/
            content: snackbarClasses.content,
            title: snackbarClasses.title,
            description: snackbarClasses.description,
            /********/
            closeButton: snackbarClasses.closeButton,
            actionButton: snackbarClasses.actionButton,
            cancelButton: snackbarClasses.cancelButton,
            /********/
            info: snackbarClasses.info,
            error: snackbarClasses.error,
            success: snackbarClasses.success,
            warning: snackbarClasses.warning,
          },
        }}
        icons={{
          loading: <span className={snackbarClasses.loadingIcon} />,
          info: <InfoIcon className={snackbarClasses.iconSvg} />,
          success: <CheckCircleIcon className={snackbarClasses.iconSvg} />,
          warning: <WarningIcon className={snackbarClasses.iconSvg} />,
          error: <ErrorIcon className={snackbarClasses.iconSvg} />,
        }}
      />
    </Portal>
  );
}

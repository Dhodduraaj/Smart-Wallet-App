import React, { useState, useCallback } from 'react';
import {
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment,
  IconButton,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

/**
 * Password input with visible toggle — uses OutlinedInput (not TextField) so
 * endAdornment + IconButton render reliably on MUI v9, mobile, and auth pages.
 */
const PasswordField = ({
  label = 'Password',
  value,
  onChange,
  showPassword: controlledShow,
  onToggleVisibility,
  startAdornment,
  authPage = false,
  fullWidth = true,
  required = false,
  name,
  autoComplete,
  sx,
  size,
}) => {
  const [internalShow, setInternalShow] = useState(false);
  const isControlled = controlledShow !== undefined;
  const showPassword = isControlled ? controlledShow : internalShow;

  const handleToggle = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (onToggleVisibility) {
        onToggleVisibility();
      } else {
        setInternalShow((prev) => !prev);
      }
    },
    [onToggleVisibility]
  );

  const iconSx = authPage
    ? { color: 'rgba(255, 255, 255, 0.75)', fontSize: 22 }
    : { color: 'text.secondary', fontSize: 22 };

  const toggleButtonSx = authPage
    ? {
        color: 'rgba(255, 255, 255, 0.85)',
        visibility: 'visible',
        opacity: 1,
        zIndex: 2,
        '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
      }
    : {
        color: 'text.secondary',
        visibility: 'visible',
        opacity: 1,
        zIndex: 2,
      };

  return (
    <FormControl
      variant="outlined"
      fullWidth={fullWidth}
      required={required}
      size={size}
      sx={{
        overflow: 'visible',
        ...sx,
      }}
    >
      <InputLabel htmlFor={`password-field-${label}`}>{label}</InputLabel>
      <OutlinedInput
        id={`password-field-${label}`}
        label={label}
        name={name}
        autoComplete={autoComplete}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        size={size}
        startAdornment={
          startAdornment ? (
            <InputAdornment position="start">{startAdornment}</InputAdornment>
          ) : null
        }
        endAdornment={
          <InputAdornment position="end" sx={{ ml: 0.5, mr: 0, flexShrink: 0 }}>
            <IconButton
              type="button"
              tabIndex={0}
              onClick={handleToggle}
              onMouseDown={(e) => e.preventDefault()}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              sx={toggleButtonSx}
            >
              {showPassword ? (
                <VisibilityOff sx={iconSx} />
              ) : (
                <Visibility sx={iconSx} />
              )}
            </IconButton>
          </InputAdornment>
        }
        sx={{
          overflow: 'visible',
          pr: 1.5,
          '& .MuiInputAdornment-root': {
            overflow: 'visible',
          },
        }}
      />
    </FormControl>
  );
};

export default PasswordField;

import React, { useRef } from 'react';
import { TextField, InputAdornment, Box } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { formatDateDDMMYYYY } from '../lib/transactionSorter';

/**
 * CustomDateInput:
 * Uses the Android OS native Material date picker and browser built-in date picker,
 * while showcasing the selected date strictly in DD/MM/YYYY format throughout the application.
 *
 * Tapping or clicking anywhere on the field directly invokes the native Android / browser
 * date picker dialog (just like the time picker invokes the native time picker), while
 * preserving canonical YYYY-MM-DD storage and DD/MM/YYYY visual display.
 */
export default function CustomDateInput({
  label = 'Date',
  value = '',
  onChange,
  name,
  disabled = false,
  required = false,
  fullWidth = true,
  size = 'small',
  error,
  helperText,
  sx = {},
  InputLabelProps = {},
  inputProps = {},
  ...otherProps
}) {
  const nativeInputRef = useRef(null);

  // Canonical YYYY-MM-DD for native HTML5 date input
  const nativeValue = (value && /^\d{4}-\d{2}-\d{2}/.test(String(value).trim()))
    ? String(value).trim().substring(0, 10)
    : '';

  // Showcased date strictly in DD/MM/YYYY format
  const displayValue = value ? formatDateDDMMYYYY(value) : '';

  const handleNativeChange = (e) => {
    const val = e.target.value; // YYYY-MM-DD from native date picker
    if (onChange) {
      onChange({
        target: {
          name: name || e.target.name || '',
          value: val
        }
      });
    }
  };

  const handleNativeClick = (e) => {
    if (disabled) return;
    if (typeof e.target.showPicker === 'function') {
      try {
        e.target.showPicker();
      } catch (err) {
        // Fallback for native Android touch handling
      }
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        width: fullWidth ? '100%' : 'auto',
        display: fullWidth ? 'block' : 'inline-block'
      }}
    >
      {/* 1. Showcasing TextField (strictly in DD/MM/YYYY format) */}
      <TextField
        label={label}
        value={displayValue === '—' ? '' : displayValue}
        placeholder="DD/MM/YYYY"
        disabled={disabled}
        required={required}
        fullWidth={fullWidth}
        size={size}
        error={error}
        helperText={helperText}
        InputLabelProps={{ shrink: true, ...InputLabelProps }}
        inputProps={{
          readOnly: true,
          style: { cursor: disabled ? 'default' : 'pointer' },
          ...inputProps
        }}
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <CalendarMonthIcon
                fontSize="small"
                sx={{ color: disabled ? 'text.disabled' : 'primary.main', mr: 0.5 }}
              />
            </InputAdornment>
          )
        }}
        sx={{
          pointerEvents: 'none', // Touch and click pass directly to native input
          ...sx
        }}
        {...otherProps}
      />

      {/* 2. Full-surface Native HTML5 Date Input: triggers Android OS Material & browser native picker */}
      <input
        ref={nativeInputRef}
        type="date"
        name={name}
        value={nativeValue}
        onChange={handleNativeChange}
        onClick={handleNativeClick}
        disabled={disabled}
        required={required}
        tabIndex={0}
        aria-label={label}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: helperText ? 'calc(100% - 20px)' : '100%',
          opacity: 0,
          cursor: disabled ? 'default' : 'pointer',
          zIndex: 1,
          border: 'none',
          padding: 0,
          margin: 0
        }}
      />
    </Box>
  );
}

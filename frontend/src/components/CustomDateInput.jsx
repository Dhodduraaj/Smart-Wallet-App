import React, { useRef, useState, useEffect } from 'react';
import { TextField, InputAdornment, IconButton, Box } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { formatDateDDMMYYYY, parseDDMMYYYYtoYYYYMMDD } from '../lib/transactionSorter';

/**
 * CustomDateInput:
 * Reusable input component that visibly presents and accepts dates in DD/MM/YYYY format,
 * while maintaining seamless interoperability with the underlying standard YYYY-MM-DD values
 * expected across forms, storage, and APIs.
 *
 * Provides:
 * - Direct calendar icon tap to trigger native OS/browser date picker.
 * - Manual input validation & formatting for DD/MM/YYYY.
 * - Standard SyntheticEvent propagation { target: { name, value: 'YYYY-MM-DD' } }.
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
  const hiddenDateInputRef = useRef(null);

  const getFormatted = (val) => {
    if (!val) return '';
    const formatted = formatDateDDMMYYYY(val);
    return formatted === '—' ? '' : formatted;
  };

  const [textVal, setTextVal] = useState(getFormatted(value));

  useEffect(() => {
    setTextVal(getFormatted(value));
  }, [value]);

  const openPicker = () => {
    if (disabled) return;
    if (hiddenDateInputRef.current) {
      if (typeof hiddenDateInputRef.current.showPicker === 'function') {
        try {
          hiddenDateInputRef.current.showPicker();
          return;
        } catch (err) {
          // If showPicker throws or is blocked, fallback below
        }
      }
      try {
        hiddenDateInputRef.current.focus();
        hiddenDateInputRef.current.click();
      } catch (e) {}
    }
  };

  const handleNativeDateChange = (e) => {
    const rawVal = e.target.value; // YYYY-MM-DD
    if (onChange) {
      onChange({
        target: {
          name: name || e.target.name,
          value: rawVal
        }
      });
    }
  };

  const handleTextChange = (e) => {
    const newText = e.target.value;
    setTextVal(newText);

    if (!newText.trim()) {
      if (onChange) {
        onChange({
          target: {
            name,
            value: ''
          }
        });
      }
      return;
    }

    // Check if user finished typing DD/MM/YYYY
    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(newText.trim())) {
      const yyyymmdd = parseDDMMYYYYtoYYYYMMDD(newText);
      if (onChange) {
        onChange({
          target: {
            name,
            value: yyyymmdd
          }
        });
      }
    }
  };

  const handleBlur = () => {
    // If not matching valid date pattern, reset to the controlled value
    if (!/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(textVal.trim())) {
      setTextVal(getFormatted(value));
    }
  };

  const nativeValue = (value && /^\d{4}-\d{2}-\d{2}/.test(String(value).trim()))
    ? String(value).trim().substring(0, 10)
    : '';

  return (
    <Box sx={{ position: 'relative', width: fullWidth ? '100%' : 'auto', display: 'inline-block' }}>
      <TextField
        label={label}
        value={textVal}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder="DD/MM/YYYY"
        disabled={disabled}
        required={required}
        fullWidth={fullWidth}
        size={size}
        error={error}
        helperText={helperText}
        InputLabelProps={{ shrink: true, ...InputLabelProps }}
        inputProps={{
          inputMode: 'numeric',
          pattern: '[0-9]{2}/[0-9]{2}/[0-9]{4}',
          maxLength: 10,
          ...inputProps
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="Open calendar"
                edge="end"
                size="small"
                disabled={disabled}
                onClick={openPicker}
                sx={{ color: 'text.secondary', p: 0.5 }}
              >
                <CalendarMonthIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          )
        }}
        sx={{
          '& .MuiInputBase-input': {
            cursor: 'pointer'
          },
          ...sx
        }}
        {...otherProps}
      />

      {/* Hidden native date input to trigger OS/browser date picker dialog */}
      <input
        ref={hiddenDateInputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={nativeValue}
        onChange={handleNativeDateChange}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1px',
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
          border: 'none',
          padding: 0,
          margin: 0
        }}
      />
    </Box>
  );
}

import React, { useState, useMemo } from 'react';
import {
  TextField,
  InputAdornment,
  IconButton,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  MenuItem,
  Select,
  Chip,
  useTheme
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import CloseIcon from '@mui/icons-material/Close';
import { formatDateDDMMYYYY, getLocalDateString } from '../lib/transactionSorter';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad2 = (n) => String(n).padStart(2, '0');

function parseYMD(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parts = trimmed.substring(0, 10).split('-');
      return {
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10),
        day: parseInt(parts[2], 10)
      };
    }
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate()
    };
  }
  return null;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * CustomDateInput:
 * An interactive date picker that strictly displays dates in DD/MM/YYYY format,
 * opens a touch-friendly calendar on tap (preventing unwanted virtual keyboard popups),
 * and emits standard YYYY-MM-DD values without timezone shifts.
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
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const todayStr = getLocalDateString();
  const todayParsed = useMemo(() => parseYMD(todayStr), [todayStr]);
  const selectedParsed = useMemo(() => parseYMD(value), [value]);

  const [viewYear, setViewYear] = useState(() => (selectedParsed?.year || todayParsed?.year || 2026));
  const [viewMonth, setViewMonth] = useState(() => (selectedParsed?.month || todayParsed?.month || 11));

  const years = useMemo(() => {
    const current = todayParsed?.year || new Date().getFullYear();
    const list = [];
    for (let y = current - 10; y <= current + 10; y++) {
      list.push(y);
    }
    return list;
  }, [todayParsed]);

  const displayValue = value ? formatDateDDMMYYYY(value) : '';

  const handleOpen = () => {
    if (disabled) return;
    const base = parseYMD(value) || todayParsed;
    if (base) {
      setViewYear(base.year);
      setViewMonth(base.month);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day) => {
    const formattedYMD = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
    if (onChange) {
      onChange({
        target: {
          name: name || '',
          value: formattedYMD
        }
      });
    }
    setOpen(false);
  };

  const handleSelectToday = () => {
    if (onChange) {
      onChange({
        target: {
          name: name || '',
          value: todayStr
        }
      });
    }
    setOpen(false);
  };

  const daysInMonth = useMemo(() => getDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const firstDay = useMemo(() => getFirstDayOfWeek(viewYear, viewMonth), [viewYear, viewMonth]);

  const calendarGrid = useMemo(() => {
    const grid = [];
    // Padding before 1st of month
    for (let i = 0; i < firstDay; i++) {
      grid.push(null);
    }
    // Days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push(d);
    }
    return grid;
  }, [firstDay, daysInMonth]);

  return (
    <>
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
        onClick={handleOpen}
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
              <IconButton
                aria-label="Open interactive date picker"
                edge="end"
                size="small"
                disabled={disabled}
                onClick={handleOpen}
                sx={{ color: 'primary.main', p: 0.5 }}
              >
                <CalendarMonthIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          )
        }}
        sx={{
          cursor: disabled ? 'default' : 'pointer',
          '& .MuiInputBase-root': {
            cursor: disabled ? 'default' : 'pointer'
          },
          ...sx
        }}
        {...otherProps}
      />

      {/* Interactive Date Picker Dialog */}
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="xs"
        fullWidth
        sx={{
          zIndex: (t) => t.zIndex.modal + 20
        }}
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1.5,
            bgcolor: 'background.paper',
            boxShadow: theme.palette.mode === 'dark' ? 24 : 8,
            maxWidth: 360,
            mx: 'auto'
          }
        }}
      >
        {/* Header Preview */}
        <DialogTitle sx={{ p: 1, pb: 0.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
                {label || 'Select Date'}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {displayValue && displayValue !== '—' ? displayValue : 'Choose a date'}
              </Typography>
            </Box>
            {displayValue && displayValue !== '—' && (
              <Chip label={displayValue} color="primary" size="small" sx={{ fontWeight: 700 }} />
            )}
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 1, pt: 1.5 }}>
          {/* Month & Year Navigation Bar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1.5,
              px: 0.5
            }}
          >
            <IconButton size="small" onClick={handlePrevMonth} aria-label="Previous month" sx={{ border: '1px solid', borderColor: 'divider' }}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Select
                size="small"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  height: 34,
                  '& .MuiSelect-select': { py: 0.5, px: 1.5 }
                }}
              >
                {MONTH_NAMES.map((m, idx) => (
                  <MenuItem key={m} value={idx + 1}>
                    {m}
                  </MenuItem>
                ))}
              </Select>

              <Select
                size="small"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                sx={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  height: 34,
                  '& .MuiSelect-select': { py: 0.5, px: 1.5 }
                }}
              >
                {years.map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <IconButton size="small" onClick={handleNextMonth} aria-label="Next month" sx={{ border: '1px solid', borderColor: 'divider' }}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Weekday Names Header */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              textAlign: 'center',
              mb: 1,
              px: 0.5
            }}
          >
            {WEEKDAY_NAMES.map((day) => (
              <Typography
                key={day}
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  py: 0.5
                }}
              >
                {day}
              </Typography>
            ))}
          </Box>

          {/* Days Grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px',
              px: 0.5
            }}
          >
            {calendarGrid.map((day, idx) => {
              if (day === null) {
                return <Box key={`empty-${idx}`} sx={{ height: 36 }} />;
              }

              const isSelected =
                selectedParsed &&
                selectedParsed.year === viewYear &&
                selectedParsed.month === viewMonth &&
                selectedParsed.day === day;

              const isToday =
                todayParsed &&
                todayParsed.year === viewYear &&
                todayParsed.month === viewMonth &&
                todayParsed.day === day;

              return (
                <Box
                  key={`day-${day}`}
                  component="button"
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  sx={{
                    height: 36,
                    width: '100%',
                    maxWidth: 36,
                    mx: 'auto',
                    border: isToday && !isSelected ? `2px solid ${theme.palette.primary.main}` : 'none',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? theme.palette.primary.main : 'transparent',
                    color: isSelected
                      ? theme.palette.primary.contrastText || '#ffffff'
                      : isToday
                      ? theme.palette.primary.main
                      : theme.palette.text.primary,
                    fontWeight: isSelected || isToday ? 700 : 500,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease-in-out',
                    outline: 'none',
                    '&:hover': {
                      backgroundColor: isSelected
                        ? theme.palette.primary.dark || theme.palette.primary.main
                        : 'action.hover'
                    },
                    '&:focus-visible': {
                      boxShadow: `0 0 0 2px ${theme.palette.primary.light}`
                    }
                  }}
                  aria-label={`Select ${day} ${MONTH_NAMES[viewMonth - 1]} ${viewYear}`}
                >
                  {day}
                </Box>
              );
            })}
          </Box>
        </DialogContent>

        {/* Action Buttons */}
        <DialogActions sx={{ px: 2, pt: 1, pb: 0.5, justifyContent: 'space-between' }}>
          <Button
            size="small"
            startIcon={<TodayIcon fontSize="small" />}
            onClick={handleSelectToday}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Today
          </Button>

          <Button
            size="small"
            color="inherit"
            onClick={handleClose}
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

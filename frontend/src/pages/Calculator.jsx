import { useCallback, useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Tooltip, useTheme, useMediaQuery } from '@mui/material';
import { BackspaceRounded } from '@mui/icons-material';

/* ---------- Utils ---------- */
function formatDisplay(value) {
  if (value === 'Error') return value;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0';
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded);
}

/* ---------- Calculator ---------- */
export default function Calculator() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState(null);
  const [operator, setOperator] = useState(null);
  const [freshOperand, setFreshOperand] = useState(true);

  /* ---------- Input ---------- */
  const inputDigit = useCallback((digit) => {
    setDisplay((prev) => {
      if (freshOperand) return digit === '.' ? '0.' : digit;
      if (digit === '.' && prev.includes('.')) return prev;
      if (prev === '0' && digit !== '.') return digit;
      return prev + digit;
    });
    setFreshOperand(false);
  }, [freshOperand]);

  const clearAll = useCallback(() => {
    setDisplay('0');
    setStored(null);
    setOperator(null);
    setFreshOperand(true);
  }, []);

  /* ---------- Undo / Backspace ---------- */
  const handleUndo = useCallback(() => {
    // 1. Error state -> reset to initial '0'
    if (display === 'Error') {
      setDisplay('0');
      setFreshOperand(true);
      return;
    }

    // 2. User is entering second operand (operator is active, digits have been entered)
    if (operator !== null && stored !== null && !freshOperand) {
      if (display.length > 1) {
        const next = display.slice(0, -1);
        if (next === '-' || next === '' || next === '-0') {
          setDisplay('0');
          setFreshOperand(true);
        } else {
          setDisplay(next);
        }
      } else {
        // Leaving 2nd operand empty, waiting for new input
        setDisplay('0');
        setFreshOperand(true);
      }
      return;
    }

    // 3. Operator was selected, but user hasn't typed second operand yet (freshOperand === true)
    if (operator !== null && stored !== null && freshOperand) {
      // Undo removes the operator and restores the first operand as editable
      setDisplay(stored);
      setStored(null);
      setOperator(null);
      setFreshOperand(false);
      return;
    }

    // 4. First operand or calculated result
    if (display && display !== '0') {
      if (display.length > 1) {
        const next = display.slice(0, -1);
        if (next === '-' || next === '' || next === '-0') {
          setDisplay('0');
          setFreshOperand(true);
        } else {
          setDisplay(next);
          setFreshOperand(false);
        }
      } else {
        setDisplay('0');
        setFreshOperand(true);
      }
    }
  }, [display, operator, stored, freshOperand]);

  /* ---------- Math ---------- */
  const compute = useCallback((a, b, op) => {
    const x = parseFloat(a);
    const y = parseFloat(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return '0';

    switch (op) {
      case '+':
        return formatDisplay(x + y);
      case '−':
        return formatDisplay(x - y);
      case '×':
        return formatDisplay(x * y);
      case '÷':
        return y === 0 ? 'Error' : formatDisplay(x / y);
      case '%':
        return y === 0 ? 'Error' : formatDisplay((x / y) * 100);
      default:
        return formatDisplay(y);
    }
  }, []);

  const chooseOperator = useCallback((nextOp) => {
    if (operator && stored !== null && !freshOperand) {
      const result = compute(stored, display, operator);
      if (result === 'Error') {
        clearAll();
        return;
      }
      setStored(result);
      setDisplay(result);
    } else {
      setStored(display);
    }
    setOperator(nextOp);
    setFreshOperand(true);
  }, [operator, stored, display, freshOperand, compute, clearAll]);

  const handleEquals = useCallback(() => {
    if (!operator || stored === null) return;
    const result = compute(stored, display, operator);
    setDisplay(result);
    setStored(null);
    setOperator(null);
    setFreshOperand(true);
  }, [operator, stored, display, compute]);

  /* ---------- Keyboard Support ---------- */
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        inputDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        inputDigit('.');
      } else if (e.key === '+') {
        e.preventDefault();
        chooseOperator('+');
      } else if (e.key === '-') {
        e.preventDefault();
        chooseOperator('−');
      } else if (e.key === '*') {
        e.preventDefault();
        chooseOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        chooseOperator('÷');
      } else if (e.key === '%') {
        e.preventDefault();
        chooseOperator('%');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputDigit, chooseOperator, handleEquals, handleUndo, clearAll]);

  /* ---------- Expression Preview ---------- */
  const expression =
    operator && stored !== null
      ? `${stored} ${operator} ${freshOperand ? '' : display}`
      : '';

  /* ---------- Contained Button Styles ---------- */
  const baseBtnSx = {
    minHeight: isMobile ? 56 : 50,
    fontSize: isMobile ? '1.25rem' : '1.1rem',
    fontWeight: 600,
    borderRadius: 2,
    textTransform: 'none',
    boxShadow: 'none',
    transition: 'background-color 0.15s ease, transform 0.08s ease, box-shadow 0.15s ease',
    '&:active': {
      transform: 'scale(0.96)',
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: '2px',
    },
  };

  // 1. Number buttons & decimal point (Neutral filled surface)
  const numBtnSx = {
    ...baseBtnSx,
    bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
    color: isDark ? '#f8fafc' : '#0f172a',
    '&:hover': {
      bgcolor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#e2e8f0',
      boxShadow: 'none',
    },
    '&:active': {
      ...baseBtnSx['&:active'],
      bgcolor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#cbd5e1',
    },
  };

  // 2. Operators (+, −, ×, ÷, %) (Distinct filled accent color)
  const opBtnSx = {
    ...baseBtnSx,
    bgcolor: isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(26, 86, 219, 0.12)',
    color: isDark ? '#93c5fd' : '#1a56db',
    '&:hover': {
      bgcolor: isDark ? 'rgba(59, 130, 246, 0.32)' : 'rgba(26, 86, 219, 0.2)',
      boxShadow: 'none',
    },
    '&:active': {
      ...baseBtnSx['&:active'],
      bgcolor: isDark ? 'rgba(59, 130, 246, 0.42)' : 'rgba(26, 86, 219, 0.28)',
    },
  };

  // 3. Equals (=) (Primary filled action color)
  const equalsBtnSx = {
    ...baseBtnSx,
    bgcolor: '#1a56db',
    color: '#ffffff',
    '&:hover': {
      bgcolor: '#1e40af',
      boxShadow: '0 2px 6px rgba(26, 86, 219, 0.35)',
    },
    '&:active': {
      ...baseBtnSx['&:active'],
      bgcolor: '#1e3a8a',
    },
  };

  // 4. Clear (C) (Filled warning/destructive color)
  const clearBtnSx = {
    ...baseBtnSx,
    bgcolor: isDark ? 'rgba(239, 68, 68, 0.22)' : '#fee2e2',
    color: isDark ? '#fca5a5' : '#b91c1c',
    '&:hover': {
      bgcolor: isDark ? 'rgba(239, 68, 68, 0.32)' : '#fecaca',
      boxShadow: 'none',
    },
    '&:active': {
      ...baseBtnSx['&:active'],
      bgcolor: isDark ? 'rgba(239, 68, 68, 0.42)' : '#fca5a5',
    },
  };

  // 5. Undo (⌫) (Filled secondary/action color)
  const undoBtnSx = {
    ...baseBtnSx,
    bgcolor: isDark ? 'rgba(148, 163, 184, 0.18)' : '#e2e8f0',
    color: isDark ? '#cbd5e1' : '#334155',
    '&:hover': {
      bgcolor: isDark ? 'rgba(148, 163, 184, 0.28)' : '#cbd5e1',
      boxShadow: 'none',
    },
    '&:active': {
      ...baseBtnSx['&:active'],
      bgcolor: isDark ? 'rgba(148, 163, 184, 0.38)' : '#94a3b8',
    },
  };

  return (
    <Box sx={{ maxWidth: 400, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Calculator
      </Typography>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            bgcolor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.03)',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid rgba(0, 0, 0, 0.04)',
          }}
        >
          <Typography
            variant="body2"
            align="right"
            sx={{
              color: 'text.secondary',
              mb: 0.5,
              minHeight: 20,
              fontFamily: 'monospace',
              fontSize: '0.9rem',
            }}
          >
            {expression || '\u00A0'}
          </Typography>

          <Typography
            variant="h4"
            align="right"
            sx={{
              fontFamily: 'monospace',
              minHeight: 48,
              wordBreak: 'break-all',
              fontWeight: 700,
              color: display === 'Error' ? 'error.main' : 'text.primary',
            }}
          >
            {display}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 1.25,
          }}
        >
          {/* Row 1: C | ⌫ | % | ÷ */}
          <Button
            variant="contained"
            disableElevation
            sx={clearBtnSx}
            onClick={clearAll}
            aria-label="Clear all"
          >
            C
          </Button>

          <Tooltip title="Undo last input" arrow>
            <Button
              variant="contained"
              disableElevation
              sx={undoBtnSx}
              onClick={handleUndo}
              aria-label="Undo last input"
            >
              <BackspaceRounded fontSize="small" />
            </Button>
          </Tooltip>

          <Button
            variant="contained"
            disableElevation
            sx={opBtnSx}
            onClick={() => chooseOperator('%')}
            aria-label="Percentage"
          >
            %
          </Button>

          <Button
            variant="contained"
            disableElevation
            sx={opBtnSx}
            onClick={() => chooseOperator('÷')}
            aria-label="Divide"
          >
            ÷
          </Button>

          {/* Row 2: 7 | 8 | 9 | × */}
          {['7', '8', '9'].map((d) => (
            <Button
              key={d}
              variant="contained"
              disableElevation
              sx={numBtnSx}
              onClick={() => inputDigit(d)}
            >
              {d}
            </Button>
          ))}

          <Button
            variant="contained"
            disableElevation
            sx={opBtnSx}
            onClick={() => chooseOperator('×')}
            aria-label="Multiply"
          >
            ×
          </Button>

          {/* Row 3: 4 | 5 | 6 | − */}
          {['4', '5', '6'].map((d) => (
            <Button
              key={d}
              variant="contained"
              disableElevation
              sx={numBtnSx}
              onClick={() => inputDigit(d)}
            >
              {d}
            </Button>
          ))}

          <Button
            variant="contained"
            disableElevation
            sx={opBtnSx}
            onClick={() => chooseOperator('−')}
            aria-label="Subtract"
          >
            −
          </Button>

          {/* Row 4: 1 | 2 | 3 | + */}
          {['1', '2', '3'].map((d) => (
            <Button
              key={d}
              variant="contained"
              disableElevation
              sx={numBtnSx}
              onClick={() => inputDigit(d)}
            >
              {d}
            </Button>
          ))}

          <Button
            variant="contained"
            disableElevation
            sx={opBtnSx}
            onClick={() => chooseOperator('+')}
            aria-label="Add"
          >
            +
          </Button>

          {/* Row 5: 0 (span 2) | . | = */}
          <Button
            variant="contained"
            disableElevation
            sx={{ ...numBtnSx, gridColumn: 'span 2' }}
            onClick={() => inputDigit('0')}
          >
            0
          </Button>

          <Button
            variant="contained"
            disableElevation
            sx={numBtnSx}
            onClick={() => inputDigit('.')}
          >
            .
          </Button>

          <Button
            variant="contained"
            disableElevation
            sx={equalsBtnSx}
            onClick={handleEquals}
            aria-label="Equals"
          >
            =
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
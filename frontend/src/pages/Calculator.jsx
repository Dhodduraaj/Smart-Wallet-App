import React, { useCallback, useState } from 'react';
import { Box, Typography, Button, Paper, useTheme, useMediaQuery } from '@mui/material';

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

  /* ---------- Expression Preview ---------- */
  const expression =
    operator && stored !== null
      ? `${stored} ${operator} ${freshOperand ? '' : display}`
      : '';

  /* ---------- UI ---------- */
  const btnSx = {
    minHeight: isMobile ? 56 : 48,
    fontSize: isMobile ? '1.2rem' : '1rem',
    fontWeight: 600,
    borderRadius: 2,
  };

  return (
    <Box sx={{ maxWidth: 400, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Calculator
      </Typography>

      <Paper elevation={0} sx={{ p: 2, borderRadius: 2 }}>
        {expression && (
          <Typography
            variant="body2"
            align="right"
            sx={{ color: 'text.secondary', mb: 0.5 }}
          >
            {expression}
          </Typography>
        )}

        <Typography
          variant="h4"
          align="right"
          sx={{
            fontFamily: 'monospace',
            minHeight: 56,
            wordBreak: 'break-all',
            color: display === 'Error' ? 'error.main' : 'text.primary',
            mb: 2,
          }}
        >
          {display}
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 1,
          }}
        >
          <Button variant="outlined" color="error" sx={btnSx} onClick={clearAll}>
            C
          </Button>

          <Button variant="outlined" sx={btnSx} onClick={() => chooseOperator('%')}>
            %
          </Button>

          <Button variant="outlined" sx={btnSx} onClick={() => chooseOperator('÷')}>
            ÷
          </Button>

          <Button variant="outlined" sx={btnSx} onClick={() => chooseOperator('×')}>
            ×
          </Button>

          {['7', '8', '9'].map((d) => (
            <Button key={d} variant="outlined" sx={btnSx} onClick={() => inputDigit(d)}>
              {d}
            </Button>
          ))}

          <Button variant="contained" sx={btnSx} onClick={() => chooseOperator('−')}>
            −
          </Button>

          {['4', '5', '6'].map((d) => (
            <Button key={d} variant="outlined" sx={btnSx} onClick={() => inputDigit(d)}>
              {d}
            </Button>
          ))}

          <Button variant="contained" sx={btnSx} onClick={() => chooseOperator('+')}>
            +
          </Button>

          {['1', '2', '3'].map((d) => (
            <Button key={d} variant="outlined" sx={btnSx} onClick={() => inputDigit(d)}>
              {d}
            </Button>
          ))}

          <Button
            variant="contained"
            color="primary"
            sx={{ ...btnSx, gridRow: 'span 2' }}
            onClick={handleEquals}
          >
            =
          </Button>

          <Button
            variant="outlined"
            sx={{ ...btnSx, gridColumn: 'span 2' }}
            onClick={() => inputDigit('0')}
          >
            0
          </Button>

          <Button variant="outlined" sx={btnSx} onClick={() => inputDigit('.')}>
            .
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
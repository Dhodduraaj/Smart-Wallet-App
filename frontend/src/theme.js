import { createTheme } from '@mui/material/styles';

export const getTheme = (mode) => {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: '#1a56db', // Professional Blue (banking app style)
        light: '#3b82f6',
        dark: '#1e40af',
      },
      secondary: {
        main: '#64748b', // Neutral Gray
        light: '#94a3b8',
        dark: '#475569',
      },
      background: {
        default: isDark ? '#0f172a' : '#f1f5f9',
        paper: isDark ? '#1e293b' : '#ffffff',
        glass: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)',
      },
      text: {
        primary: isDark ? '#f8fafc' : '#0f172a',
        secondary: isDark ? '#94a3b8' : '#64748b',
      },
      success: {
        main: '#059669', // Professional Green
        light: '#10b981',
        dark: '#047857',
      },
      error: {
        main: '#dc2626', // Professional Red
        light: '#ef4444',
        dark: '#b91c1c',
      },
      warning: {
        main: '#d97706', // Professional Amber
      },
      info: {
        main: '#0891b2', // Professional Cyan
      },
      divider: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
    },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      h1: { fontWeight: 600, fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em' },
      h2: { fontWeight: 600, fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em' },
      h3: { fontWeight: 600, fontFamily: "'Inter', sans-serif" },
      h4: { fontWeight: 600, fontFamily: "'Inter', sans-serif" },
      h5: { fontWeight: 600, fontFamily: "'Inter', sans-serif" },
      h6: { fontWeight: 600, fontFamily: "'Inter', sans-serif" },
      body1: { fontFamily: "'Inter', sans-serif" },
      body2: { fontFamily: "'Inter', sans-serif" },
      button: { textTransform: 'none', fontWeight: 500, fontFamily: "'Inter', sans-serif" },
    },
    shape: {
      borderRadius: 12,
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
            boxShadow: isDark 
              ? '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)' 
              : '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
            transition: 'box-shadow 0.2s ease-in-out',
            '&:hover': {
              boxShadow: isDark 
                ? '0 4px 6px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)' 
                : '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: '8px 16px',
            transition: 'all 0.15s ease-in-out',
            fontWeight: 500,
          },
          containedPrimary: {
            background: '#1a56db',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
            color: '#ffffff',
            '&:hover': {
              background: '#1e40af',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: isDark ? '#1e293b' : '#f8fafc',
            fontWeight: 500,
            color: isDark ? '#94a3b8' : '#64748b',
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
          },
          body: {
            borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid rgba(0, 0, 0, 0.04)',
          },
        },
      },
    },
  });
};

import React, { useState, useEffect } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Drawer,
  useMediaQuery,
  useTheme,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Avatar,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Sidebar from './Sidebar';
import SelfTransferDialog from './SelfTransferDialog';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import {
  DashboardOutlined,
  AccountBalanceOutlined,
  ReceiptLongOutlined,
  PaymentsOutlined,
  MoreHorizOutlined,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { requestPwaExit } from '../lib/pwaExit';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAuth } from '../context/AuthContext';

const drawerWidth = 260;

const BOTTOM_NAV_ROUTES = ['/dashboard', '/accounts', '/expenses', '/income'];

const Layout = ({ children, darkMode, toggleDarkMode }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selfTransferOpen, setSelfTransferOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const handleDrawerToggle = () => {
    setMobileOpen((open) => !open);
  };

  const closeMobileDrawer = () => {
    setMobileOpen(false);
  };

  const isAndroidApk = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  const safeAreaTop = isAndroidApk ? 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))' : '0px';
  const safeAreaBottom = isAndroidApk ? 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))' : '0px';

  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  const handleExitApp = () => {
    closeMobileDrawer();
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
    setExitDialogOpen(true);
  };

  const handleConfirmExit = async () => {
    setExitDialogOpen(false);
    if (isAndroidApk) {
      await App.exitApp();
    } else {
      requestPwaExit();
    }
  };

  useEffect(() => {
    let backListenerPromise;
    if (isAndroidApk) {
      backListenerPromise = App.addListener('backButton', (data) => {
        if (location.pathname === '/dashboard' || location.pathname === '/' || location.pathname === '/login') {
          setExitDialogOpen(true);
        } else {
          navigate(-1);
        }
      });
    }
    return () => {
      if (backListenerPromise) {
        backListenerPromise.then((handle) => handle.remove());
      }
    };
  }, [isAndroidApk, location.pathname, navigate]);

  const getBottomNavValue = () => {
    const path = location.pathname;
    if (path === '/dashboard' || path === '/') return 0;
    if (path === '/accounts') return 1;
    if (path === '/expenses') return 2;
    if (path === '/income') return 3;
    return 4;
  };

  const handleBottomNavChange = (event, newValue) => {
    if (newValue === 4) {
      setMobileOpen(true);
      return;
    }
    navigate(BOTTOM_NAV_ROUTES[newValue]);
  };

  const bottomNavValue = getBottomNavValue();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {isMobile && (
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            zIndex: theme.zIndex.drawer + 1,
            backdropFilter: 'blur(20px)',
            background:
              theme.palette.mode === 'dark'
                ? 'rgba(11, 15, 25, 0.75)'
                : 'rgba(255, 255, 255, 0.75)',
            borderBottom: '1px solid',
            borderColor: 'divider',
            color: 'text.primary',
            pt: safeAreaTop,
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <IconButton
                color="inherit"
                aria-label="open navigation menu"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 1 }}
              >
                <MenuIcon />
              </IconButton>
              {user && (
                <Avatar
                  src={user.avatar ? `/avatars/${user.avatar}.png` : undefined}
                  sx={{
                    width: 32,
                    height: 32,
                    mr: 1,
                    fontSize: 14,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                    cursor: 'pointer'
                  }}
                  onClick={() => navigate('/profile')}
                >
                  {!user.avatar && (user.fullName?.charAt(0)?.toUpperCase() || 'U')}
                </Avatar>
              )}
              <Typography
                variant="h6"
                noWrap
                component="div"
                sx={{
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Smart Wallet
              </Typography>
            </Box>
            {isAndroidApk && (
              <Tooltip title="Exit app">
                <IconButton
                  color="inherit"
                  aria-label="Exit app"
                  onClick={handleExitApp}
                  size="small"
                  sx={{ color: 'text.secondary' }}
                >
                  <ExitToAppIcon />
                </IconButton>
              </Tooltip>
            )}
          </Toolbar>
        </AppBar>
      )}

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={closeMobileDrawer}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: 'block', sm: 'block', md: 'none' },
              [`& .MuiDrawer-paper`]: {
                width: drawerWidth,
                boxShadow: theme.shadows[8],
                pt: safeAreaTop,
              },
            }}
          >
            <Sidebar
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              onNavigate={closeMobileDrawer}
              onSelfTransferClick={() => setSelfTransferOpen(true)}
            />
          </Drawer>
        ) : (
          <Sidebar
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            onSelfTransferClick={() => setSelfTransferOpen(true)}
          />
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 4 },
          pb: {
            xs: isAndroidApk ? `calc(80px + ${safeAreaBottom})` : 10,
            sm: isAndroidApk ? `calc(80px + ${safeAreaBottom})` : 10,
            md: 4,
          },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: isMobile ? `calc(64px + ${safeAreaTop})` : 0,
          minWidth: 0,
        }}
      >
        {children}
      </Box>

      {isMobile && (
        <Paper
          elevation={4}
          style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000 }}
          sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            background:
              theme.palette.mode === 'dark'
                ? 'rgba(15, 15, 35, 0.85)'
                : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            pb: safeAreaBottom,
          }}
        >
          <BottomNavigation
            showLabels
            value={bottomNavValue}
            onChange={handleBottomNavChange}
            sx={{
              background: 'transparent',
              height: 64,
              '& .MuiBottomNavigationAction-root': {
                minWidth: 'auto',
                color: 'text.secondary',
                py: 1,
                opacity: 0.72,
                transition: 'color 0.2s ease, opacity 0.2s ease',
              },
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.7rem',
              },
              '& .Mui-selected': {
                color: 'primary.main',
                opacity: 1,
                '& .MuiBottomNavigationAction-label': {
                  fontSize: '0.72rem',
                  fontWeight: 600,
                },
                '& .MuiSvgIcon-root': {
                  transform: 'scale(1.12)',
                  transition: 'transform 0.2s ease',
                },
              },
            }}
          >
            <BottomNavigationAction label="Home" icon={<DashboardOutlined />} />
            <BottomNavigationAction label="Accounts" icon={<AccountBalanceOutlined />} />
            <BottomNavigationAction label="Expenses" icon={<ReceiptLongOutlined />} />
            <BottomNavigationAction label="Income" icon={<PaymentsOutlined />} />
            <BottomNavigationAction
              label="More"
              icon={<MoreHorizOutlined />}
              sx={{
                ...(bottomNavValue === 4 && {
                  color: 'primary.main',
                  opacity: 1,
                }),
              }}
            />
          </BottomNavigation>
        </Paper>
      )}
      <SelfTransferDialog open={selfTransferOpen} onClose={() => setSelfTransferOpen(false)} />

      <Dialog open={exitDialogOpen} onClose={() => setExitDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Exit Smart-Wallet</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to exit the app?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setExitDialogOpen(false)} variant="contained" color="error">No</Button>
          <Button onClick={handleConfirmExit} variant="contained" color="primary">Yes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Layout;

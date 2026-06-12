import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Box,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Avatar,
} from '@mui/material';
import {
  DashboardOutlined,
  AccountBalanceOutlined,
  ReceiptLongOutlined,
  PaymentsOutlined,
  NotificationsNoneOutlined,
  AssessmentOutlined,
  CalculateOutlined,
  PersonOutlineOutlined,
  LogoutOutlined,
  Brightness4Outlined,
  Brightness7Outlined,
  AccountBalanceWalletOutlined,
  InfoOutlined,
  SwapHorizOutlined,
} from '@mui/icons-material';

const drawerWidth = 260;

const Sidebar = ({ darkMode, toggleDarkMode, onNavigate, onSelfTransferClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  const handleNav = (path) => {
    navigate(path);
    onNavigate?.();
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardOutlined />, path: '/dashboard' },
    { text: 'Accounts', icon: <AccountBalanceOutlined />, path: '/accounts' },
    { text: 'Income', icon: <PaymentsOutlined />, path: '/income' },
    { text: 'Expenses', icon: <ReceiptLongOutlined />, path: '/expenses' },
    { text: 'Self Transfer', icon: <SwapHorizOutlined />, onClick: onSelfTransferClick },
    { text: 'Reminders', icon: <NotificationsNoneOutlined />, path: '/reminders' },
    { text: 'Calculator', icon: <CalculateOutlined />, path: '/calculator' },
    { text: 'Reports', icon: <AssessmentOutlined />, path: '/reports' },
    { text: 'Profile', icon: <PersonOutlineOutlined />, path: '/profile' },
    { text: 'About', icon: <InfoOutlined />, path: '/about' },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      {/* Brand Header */}
      <Toolbar sx={{ display: 'flex', alignItems: 'center', px: 2, gap: 1 }}>
        <img src="/icon-round.png" alt="Smart Wallet" style={{ width: 32, height: 32 }} />
        <Typography
          variant="h6"
          noWrap
          component="div"
          sx={{
            fontWeight: 800,
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '0.5px',
          }}
        >
          Smart Wallet
        </Typography>
      </Toolbar>

      <Divider />

      {/* Navigation List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', p: 1.5 }}>
        <List sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {menuItems.map((item) => {
            const active =
              location.pathname === item.path ||
              (item.path === '/dashboard' && location.pathname === '/');
            return (
              <ListItemButton
                key={item.text}
                onClick={() => {
                  if (item.onClick) {
                    item.onClick();
                    onNavigate?.();
                  } else {
                    handleNav(item.path);
                  }
                }}
                sx={{
                  borderRadius: 2,
                  py: 1.25,
                  bgcolor: active ? 'primary.main' : 'transparent',
                  color: active ? '#ffffff' : 'text.primary',
                  '&:hover': {
                    bgcolor: active ? 'primary.dark' : 'action.hover',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                <ListItemIcon sx={{ color: active ? '#ffffff' : 'text.secondary', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontWeight: active ? 600 : 500,
                    fontSize: '0.95rem',
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>

        {/* Footer Area */}
        <Box>
          <Divider sx={{ mb: 2 }} />

          {/* User Block */}
          {user && (
            <Box sx={{ px: 1, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar
                src={user.avatar ? `/avatars/${user.avatar}.svg` : undefined}
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: 16,
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                }}
              >
                {!user.avatar && (user.fullName?.charAt(0)?.toUpperCase() || 'U')}
              </Avatar>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  {user.fullName}
                </Typography>
                <Typography variant="caption" noWrap color="text.secondary" sx={{ display: 'block', fontSize: '0.75rem' }}>
                  {user.email}
                </Typography>
              </Box>
              <IconButton onClick={toggleDarkMode} color="inherit" size="small" sx={{ flexShrink: 0 }}>
                {darkMode ? <Brightness7Outlined /> : <Brightness4Outlined />}
              </IconButton>
            </Box>
          )}

          {/* Logout Button */}
          <ListItemButton
            onClick={() => setLogoutDialogOpen(true)}
            sx={{
              borderRadius: 2,
              py: 1.25,
              color: 'error.main',
              '&:hover': {
                bgcolor: 'error.lighter', // Soft red back in style, fallback automatically handles this
                opacity: 0.85,
              },
            }}
          >
            <ListItemIcon sx={{ color: 'error.main', minWidth: 40 }}>
              <LogoutOutlined />
            </ListItemIcon>
            <ListItemText
              primary="Log Out"
              primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }}
            />
          </ListItemButton>
        </Box>
      </Box>

      <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Logout</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to log out?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLogoutDialogOpen(false)} variant="outlined" color="primary">No</Button>
          <Button onClick={() => { setLogoutDialogOpen(false); logout(); }} variant="contained" color="error">Yes</Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default Sidebar;

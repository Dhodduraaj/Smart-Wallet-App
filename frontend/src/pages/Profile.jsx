import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Box, Typography, Card, CardContent, Avatar, Divider, Grid, Button, Chip,
} from '@mui/material';
import { PersonOutlineOutlined, EmailOutlined, CalendarTodayOutlined, LogoutOutlined } from '@mui/icons-material';

const Profile = () => {
  const { user, logout } = useAuth();

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 4 }}>Profile</Typography>

      <Grid container spacing={4}>
        {/* User Info Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Avatar
                sx={{
                  width: 100,
                  height: 100,
                  mx: 'auto',
                  mb: 3,
                  fontSize: 40,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                }}
              >
                {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
              </Avatar>

              <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
                {user?.fullName || 'Unknown User'}
              </Typography>
              <Chip label="Active Member" color="success" size="small" sx={{ mb: 3, fontWeight: 600 }} />

              <Divider sx={{ my: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <PersonOutlineOutlined color="primary" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Full Name</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{user?.fullName}</Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <EmailOutlined color="primary" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">Email Address</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{user?.email}</Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CalendarTodayOutlined color="primary" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">User ID</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace', wordBreak: 'break-all' }}>{user?.userId}</Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Actions Card */}
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Quick Tips</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', border: '1px dashed', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: 'primary.main' }}>
                    📊 Dashboard Overview
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Visit the Dashboard to see your financial summary with real-time charts and metrics.
                  </Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', border: '1px dashed', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: 'secondary.main' }}>
                    📄 PDF Reports
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Generate and download detailed PDF financial statements from the Reports page.
                  </Typography>
                </Box>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', border: '1px dashed', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5, color: 'success.main' }}>
                    🔔 Reminders
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Set up daily expense reminders and track upcoming bills on the Reminders page.
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Button
            fullWidth
            variant="outlined"
            color="error"
            size="large"
            startIcon={<LogoutOutlined />}
            onClick={logout}
            sx={{ py: 1.5 }}
          >
            Log Out
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Profile;

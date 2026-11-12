import React, { useState, useEffect } from 'react';
import { Box, Button, Tooltip, CircularProgress, useTheme } from '@mui/material';
import { SyncOutlined } from '@mui/icons-material';
import { toast } from 'react-hot-toast';
import { manualUnifiedSync } from '../lib/sync';
import { getSyncStatus } from '../lib/syncQueue';
import SyncStatusIndicator from './SyncStatusIndicator';

export default function CloudSyncControls({ compact = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState(getSyncStatus());

  useEffect(() => {
    const handleStatusChange = (e) => {
      const detail = e.detail || getSyncStatus();
      setSyncInfo(detail);
      if (detail.status === 'SYNCING' || detail.status === 'UPLOADING' || detail.status === 'DOWNLOADING') {
        setIsSyncing(true);
      } else {
        setIsSyncing(false);
      }
    };

    window.addEventListener('sync-status-changed', handleStatusChange);
    return () => {
      window.removeEventListener('sync-status-changed', handleStatusChange);
    };
  }, []);

  const handleSync = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isSyncing) return;

    if (!navigator.onLine) {
      toast.error('You are offline. Cannot sync with cloud.');
      return;
    }

    setIsSyncing(true);
    try {
      const res = await manualUnifiedSync();
      if (res?.message) {
        toast.success(res.message);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to sync with cloud.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {/* Unified Sync Button - Contained styling */}
      <Tooltip title={isSyncing ? 'Synchronizing with Cloud...' : 'Sync with Cloud (Upload & Download)'} arrow>
        <span>
          <Button
            variant="outlined"
            size="small"
            aria-label="Sync with Cloud"
            onClick={handleSync}
            disabled={isSyncing}
            startIcon={
              isSyncing ? (
                <CircularProgress size={15} color="inherit" />
              ) : (
                <SyncOutlined sx={{ fontSize: 18 }} />
              )
            }
            sx={{
              height: 32,
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem',
              px: 1.5,
              minWidth: 'auto',
              border: '1px solid',
              borderColor: isSyncing
                ? (isDark ? '#818cf8' : '#4f46e5')
                : (isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(79, 70, 229, 0.35)'),
              bgcolor: isSyncing
                ? (isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.15)')
                : (isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(79, 70, 229, 0.08)'),
              color: isDark ? '#818cf8' : '#4f46e5',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(79, 70, 229, 0.16)',
                borderColor: isDark ? '#818cf8' : '#4f46e5',
                transform: 'translateY(-1px)',
              },
              '&:disabled': {
                opacity: isSyncing ? 0.9 : 0.4,
              },
            }}
          >
            {isSyncing ? 'Syncing...' : 'Sync'}
          </Button>
        </span>
      </Tooltip>

      {/* Sync Status Indicator */}
      <SyncStatusIndicator compact={compact} isSyncing={isSyncing} onTriggerSync={handleSync} />
    </Box>
  );
}

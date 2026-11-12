import React, { useState, useEffect } from 'react';
import { Box, Chip, Tooltip, CircularProgress, IconButton } from '@mui/material';
import {
  CloudDoneOutlined,
  CloudSyncOutlined,
  CloudQueueOutlined,
  CloudOffOutlined,
  SyncProblemOutlined,
} from '@mui/icons-material';
import { getSyncStatus, processQueue } from '../lib/syncQueue';

export default function SyncStatusIndicator({ compact = false }) {
  const [syncInfo, setSyncInfo] = useState(getSyncStatus());
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  useEffect(() => {
    const handleStatusChange = (e) => {
      setSyncInfo(e.detail || getSyncStatus());
    };

    window.addEventListener('sync-status-changed', handleStatusChange);
    return () => {
      window.removeEventListener('sync-status-changed', handleStatusChange);
    };
  }, []);

  const handleManualSync = async (e) => {
    e.stopPropagation();
    if (syncInfo.status === 'SYNCING' || isManualSyncing) return;
    setIsManualSyncing(true);
    try {
      await processQueue();
    } finally {
      setIsManualSyncing(false);
    }
  };

  const getStatusConfig = () => {
    const isSyncing = syncInfo.status === 'SYNCING' || isManualSyncing;
    if (!syncInfo.isOnline || syncInfo.status === 'OFFLINE') {
      return {
        label: 'Offline',
        color: 'default',
        icon: <CloudOffOutlined sx={{ fontSize: 16 }} />,
        tooltip: 'Offline mode: Changes are saved locally and will sync when connected.',
        clickable: false,
      };
    }
    if (isSyncing) {
      return {
        label: 'Syncing...',
        color: 'info',
        icon: <CircularProgress size={12} color="inherit" />,
        tooltip: 'Syncing transactions with cloud database...',
        clickable: false,
      };
    }
    if (syncInfo.status === 'FAILED') {
      return {
        label: syncInfo.pendingCount > 0 ? `Failed (${syncInfo.pendingCount})` : 'Sync Failed',
        color: 'error',
        icon: <SyncProblemOutlined sx={{ fontSize: 16 }} />,
        tooltip: `Sync error: ${syncInfo.lastSyncError || 'Network issue'}. Click to retry.`,
        clickable: true,
      };
    }
    if (syncInfo.pendingCount > 0 || syncInfo.status === 'PENDING') {
      return {
        label: `${syncInfo.pendingCount} Pending`,
        color: 'warning',
        icon: <CloudQueueOutlined sx={{ fontSize: 16 }} />,
        tooltip: `${syncInfo.pendingCount} changes waiting to sync. Click to sync now.`,
        clickable: true,
      };
    }
    return {
      label: 'Synced',
      color: 'success',
      icon: <CloudDoneOutlined sx={{ fontSize: 16 }} />,
      tooltip: syncInfo.lastSyncTimestamp
        ? `All data synced to cloud (Last: ${new Date(syncInfo.lastSyncTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
        : 'All local changes synchronized with cloud database.',
      clickable: true,
    };
  };

  const config = getStatusConfig();

  return (
    <Tooltip title={config.tooltip} arrow>
      <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <Chip
          size="small"
          icon={config.icon}
          label={compact ? (syncInfo.pendingCount > 0 ? `${syncInfo.pendingCount}` : undefined) : config.label}
          color={config.color}
          variant="outlined"
          onClick={config.clickable ? handleManualSync : undefined}
          sx={{
            height: 24,
            fontSize: '0.72rem',
            fontWeight: 600,
            cursor: config.clickable ? 'pointer' : 'default',
            borderRadius: '12px',
            px: compact ? 0.2 : 0.5,
            '& .MuiChip-icon': {
              ml: compact ? '4px' : '4px',
              mr: compact ? '4px' : '2px',
            },
            transition: 'all 0.2s ease',
            '&:hover': config.clickable ? {
              opacity: 0.85,
              transform: 'scale(1.02)',
            } : {},
          }}
        />
      </Box>
    </Tooltip>
  );
}

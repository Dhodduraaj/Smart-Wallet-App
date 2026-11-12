import React, { useState, useEffect } from 'react';
import { Box, IconButton, Tooltip, CircularProgress, useTheme } from '@mui/material';
import { CloudUploadOutlined, CloudDownloadOutlined } from '@mui/icons-material';
import { toast } from 'react-hot-toast';
import { manualUploadToCloud, manualDownloadFromCloud } from '../lib/sync';
import { getSyncStatus } from '../lib/syncQueue';
import SyncStatusIndicator from './SyncStatusIndicator';

export default function CloudSyncControls({ compact = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [syncInfo, setSyncInfo] = useState(getSyncStatus());

  useEffect(() => {
    const handleStatusChange = (e) => {
      const detail = e.detail || getSyncStatus();
      setSyncInfo(detail);
      if (detail.status === 'UPLOADING') {
        setIsUploading(true);
      } else if (detail.status === 'DOWNLOADING') {
        setIsDownloading(true);
      } else {
        setIsUploading(false);
        setIsDownloading(false);
      }
    };

    window.addEventListener('sync-status-changed', handleStatusChange);
    return () => {
      window.removeEventListener('sync-status-changed', handleStatusChange);
    };
  }, []);

  const handleUpload = async (e) => {
    e.stopPropagation();
    if (isUploading || isDownloading) return;

    if (!navigator.onLine) {
      toast.error('You are offline. Cannot upload to cloud.');
      return;
    }

    setIsUploading(true);
    try {
      const res = await manualUploadToCloud();
      if (res?.message) {
        toast.success(res.message);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to upload changes to cloud.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (isUploading || isDownloading) return;

    if (!navigator.onLine) {
      toast.error('You are offline. Cannot download from cloud.');
      return;
    }

    setIsDownloading(true);
    try {
      const res = await manualDownloadFromCloud();
      if (res?.message) {
        toast.success(res.message);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to download changes from cloud.');
    } finally {
      setIsDownloading(false);
    }
  };

  const isBusy = isUploading || isDownloading;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {/* Upload Sync Button (Device to Cloud) - Contained styling */}
      <Tooltip title={isUploading ? 'Uploading to Cloud...' : 'Upload to Cloud'} arrow>
        <span>
          <IconButton
            size="small"
            aria-label="Upload to Cloud"
            onClick={handleUpload}
            disabled={isBusy}
            sx={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              border: '1px solid',
              borderColor: isUploading 
                ? (isDark ? '#818cf8' : '#1a56db')
                : (isDark ? 'rgba(99, 102, 241, 0.35)' : 'rgba(26, 86, 219, 0.25)'),
              bgcolor: isUploading
                ? (isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(26, 86, 219, 0.15)')
                : (isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(26, 86, 219, 0.08)'),
              color: isDark ? '#818cf8' : '#1a56db',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(26, 86, 219, 0.16)',
                borderColor: isDark ? '#818cf8' : '#1a56db',
                transform: 'translateY(-1px)',
              },
              '&:disabled': {
                opacity: isUploading ? 1 : 0.4,
              },
            }}
          >
            {isUploading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <CloudUploadOutlined sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {/* Download Sync Button (Cloud to Device) - Contained styling */}
      <Tooltip title={isDownloading ? 'Downloading from Cloud...' : 'Download from Cloud'} arrow>
        <span>
          <IconButton
            size="small"
            aria-label="Download from Cloud"
            onClick={handleDownload}
            disabled={isBusy}
            sx={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              border: '1px solid',
              borderColor: isDownloading
                ? (isDark ? '#34d399' : '#059669')
                : (isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(5, 150, 105, 0.25)'),
              bgcolor: isDownloading
                ? (isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(5, 150, 105, 0.15)')
                : (isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(5, 150, 105, 0.08)'),
              color: isDark ? '#34d399' : '#059669',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(5, 150, 105, 0.16)',
                borderColor: isDark ? '#34d399' : '#059669',
                transform: 'translateY(-1px)',
              },
              '&:disabled': {
                opacity: isDownloading ? 1 : 0.4,
              },
            }}
          >
            {isDownloading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <CloudDownloadOutlined sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {/* Existing Preserved Sync Status Indicator */}
      <SyncStatusIndicator compact={compact} isUploading={isUploading} isDownloading={isDownloading} />
    </Box>
  );
}

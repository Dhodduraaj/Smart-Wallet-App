import React, { useState, useEffect } from 'react';
import { Box, IconButton, Tooltip, CircularProgress } from '@mui/material';
import { CloudUploadOutlined, CloudDownloadOutlined } from '@mui/icons-material';
import { toast } from 'react-hot-toast';
import { manualUploadToCloud, manualDownloadFromCloud } from '../lib/sync';
import { getSyncStatus } from '../lib/syncQueue';
import SyncStatusIndicator from './SyncStatusIndicator';

export default function CloudSyncControls({ compact = false }) {
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
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {/* Upload Sync Button (Device to Cloud) */}
      <Tooltip title={isUploading ? 'Uploading to Cloud...' : 'Upload to Cloud'} arrow>
        <span>
          <IconButton
            size="small"
            aria-label="Upload to Cloud"
            onClick={handleUpload}
            disabled={isBusy}
            sx={{
              color: isUploading ? 'primary.main' : 'text.secondary',
              bgcolor: isUploading ? 'action.selected' : 'transparent',
              p: '6px',
              minWidth: 32,
              minHeight: 32,
              borderRadius: '8px',
              transition: 'all 0.2s ease',
              '&:hover': {
                color: 'primary.main',
                bgcolor: 'action.hover',
                transform: 'scale(1.05)',
              },
              '&:disabled': {
                opacity: isUploading ? 1 : 0.4,
              },
            }}
          >
            {isUploading ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <CloudUploadOutlined sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {/* Download Sync Button (Cloud to Device) */}
      <Tooltip title={isDownloading ? 'Downloading from Cloud...' : 'Download from Cloud'} arrow>
        <span>
          <IconButton
            size="small"
            aria-label="Download from Cloud"
            onClick={handleDownload}
            disabled={isBusy}
            sx={{
              color: isDownloading ? 'primary.main' : 'text.secondary',
              bgcolor: isDownloading ? 'action.selected' : 'transparent',
              p: '6px',
              minWidth: 32,
              minHeight: 32,
              borderRadius: '8px',
              transition: 'all 0.2s ease',
              '&:hover': {
                color: 'primary.main',
                bgcolor: 'action.hover',
                transform: 'scale(1.05)',
              },
              '&:disabled': {
                opacity: isDownloading ? 1 : 0.4,
              },
            }}
          >
            {isDownloading ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <CloudDownloadOutlined sx={{ fontSize: 20 }} />
            )}
          </IconButton>
        </span>
      </Tooltip>

      {/* Existing Preserved Sync Status Indicator */}
      <SyncStatusIndicator compact={compact} isUploading={isUploading} isDownloading={isDownloading} />
    </Box>
  );
}

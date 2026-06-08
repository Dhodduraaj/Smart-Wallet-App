import React from 'react';
import { Box, Grid, Card, CardContent, Skeleton } from '@mui/material';

const layoutPad = { xs: 2, sm: 3, md: 4 };
const fullBleedSx = {
  width: {
    xs: `calc(100% + ${layoutPad.xs * 2 * 8}px)`,
    sm: `calc(100% + ${layoutPad.sm * 2 * 8}px)`,
    md: `calc(100% + ${layoutPad.md * 2 * 8}px)`,
  },
  ml: { xs: -layoutPad.xs, sm: -layoutPad.sm, md: -layoutPad.md },
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const SkeletonDashboard = () => (
  <Box sx={{ flexGrow: 1, width: '100%', maxWidth: '100%', minWidth: 0 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
      <Skeleton variant="text" width={160} height={40} />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Skeleton variant="rounded" width={110} height={36} />
        <Skeleton variant="rounded" width={120} height={36} />
      </Box>
    </Box>

    <Box sx={{ ...fullBleedSx, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <Grid container spacing={0} sx={{ mb: 0 }}>
        {[0, 1, 2, 3].map((i) => (
          <Grid item xs={6} md={3} key={i}>
            <Card sx={{ borderRadius: 0, border: '1px solid darkblue' }}>
              <CardContent>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" height={32} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={0} sx={{ minHeight: { md: 'min(38vh, 22rem)' } }}>
        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: 0, border: '1px solid darkblue', height: '100%' }}>
            <CardContent>
              <Skeleton variant="text" width={140} />
              <Skeleton variant="rounded" height={200} sx={{ mt: 2 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 0, border: '1px solid darkblue', height: '100%' }}>
            <CardContent>
              <Skeleton variant="text" width={100} />
              <Skeleton variant="circular" width={160} height={160} sx={{ mx: 'auto', mt: 2, display: 'block' }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={0} sx={{ minHeight: { md: 'min(28vh, 16rem)' } }}>
        {[0, 1].map((i) => (
          <Grid item xs={12} md={6} key={i}>
            <Card sx={{ borderRadius: 0, border: '1px solid darkblue', height: '100%' }}>
              <CardContent>
                <Skeleton variant="text" width={160} />
                {[0, 1, 2].map((j) => (
                  <Box key={j} sx={{ display: 'flex', gap: 2, mt: 2 }}>
                    <Skeleton variant="rounded" width={32} height={32} />
                    <Box sx={{ flex: 1 }}>
                      <Skeleton variant="text" width="70%" />
                      <Skeleton variant="text" width="40%" />
                    </Box>
                    <Skeleton variant="text" width={50} />
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  </Box>
);

export default SkeletonDashboard;

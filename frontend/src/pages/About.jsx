import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Avatar,
  Button,
  Grid,
  Divider,
  Link,
} from '@mui/material';
import {
  EmailOutlined,
  GitHub,
  LinkedIn,
} from '@mui/icons-material';

const About = () => {
  return (
    <Box sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        About
      </Typography>

      <Grid container spacing={3} justifyContent="center" alignItems="center">
        <Grid item xs={12} md={8} lg={6}>
          <Card sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Avatar
                sx={{
                  width: 90,
                  height: 90,
                  margin: '0 auto 2rem',
                  bgcolor: 'primary.main',
                  fontSize: '2rem',
                  fontWeight: 700,
                }}
              >😄
              </Avatar>

              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                Dhodduraaj S P
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Full Stack Developer
              </Typography>

              <Divider sx={{ my: 3 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  startIcon={<EmailOutlined />}
                  href="mailto:dhodduraajsp@gmail.com"
                  sx={{ width: '100%', maxWidth: 300, borderRadius: 2 }}
                >
                  dhodduraajsp@gmail.com
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<GitHub />}
                  href="https://github.com/Dhodduraaj"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ width: '100%', maxWidth: 300, borderRadius: 2 }}
                >
                  github.com/Dhodduraaj
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<LinkedIn />}
                  href="https://www.linkedin.com/in/dhodduraaj"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ width: '100%', maxWidth: 300, borderRadius: 2 }}
                >
                  linkedin.com/in/dhodduraaj
                </Button>
              </Box>

              <Divider sx={{ my: 3 }} />
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 700, mb: 1 }}>
              Take it with you! - Install the app on your mobile for the complete experience.
              </Typography>
              <Divider sx={{ my: 3 }} />
              <Typography variant="body2" color="text.secondary">
                Smart Wallet - Expense Tracker
              </Typography>
              <Typography variant="caption" color="text.secondary">
                A modern expense tracking application built with React and Spring Boot
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default About;

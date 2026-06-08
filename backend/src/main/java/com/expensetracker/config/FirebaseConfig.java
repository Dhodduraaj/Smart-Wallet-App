package com.expensetracker.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class FirebaseConfig {

    private final FirebaseProperties firebaseProperties;

    @Bean
    @ConditionalOnProperty(prefix = "app.firebase", name = "enabled", havingValue = "true")
    FirebaseApp firebaseApp() throws IOException {
        if (FirebaseApp.getApps().stream().anyMatch(app -> FirebaseApp.DEFAULT_APP_NAME.equals(app.getName()))) {
            return FirebaseApp.getInstance();
        }

        try (InputStream credentialsStream = openCredentialsStream()) {
            if (credentialsStream == null) {
                throw new IllegalStateException(
                        "Firebase enabled but credentials missing. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON");
            }

            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(credentialsStream))
                    .build();

            FirebaseApp app = FirebaseApp.initializeApp(options);
            log.info("Firebase Admin SDK initialized for FCM HTTP v1");
            return app;
        }
    }

    private InputStream openCredentialsStream() throws IOException {
        if (StringUtils.hasText(firebaseProperties.getServiceAccountJson())) {
            return new ByteArrayInputStream(
                    firebaseProperties.getServiceAccountJson().getBytes(StandardCharsets.UTF_8));
        }
        if (StringUtils.hasText(firebaseProperties.getServiceAccountPath())) {
            return new FileInputStream(firebaseProperties.getServiceAccountPath());
        }
        return null;
    }
}

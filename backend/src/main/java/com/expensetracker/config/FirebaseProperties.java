package com.expensetracker.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.firebase")
public class FirebaseProperties {

    /**
     * Enable FCM when true and credentials are configured.
     */
    private boolean enabled = false;

    /**
     * Absolute path to the service account JSON file (local / VM deploy).
     */
    private String serviceAccountPath;

    /**
     * Raw service account JSON (Render, Railway, Docker secrets).
     */
    private String serviceAccountJson;
}

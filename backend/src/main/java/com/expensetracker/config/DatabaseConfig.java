package com.expensetracker.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.jdbc.DataSourceBuilder;
import javax.sql.DataSource;
import java.net.URI;

@Configuration
public class DatabaseConfig {

    @Bean
    public DataSource dataSource() {
        String dbUrl = System.getenv("DATABASE_URL");
        String username = System.getenv("DB_USERNAME");
        String password = System.getenv("DB_PASSWORD");
        
        // If DATABASE_URL is not set, fallback to DB_URL
        if (dbUrl == null || dbUrl.trim().isEmpty()) {
            dbUrl = System.getenv("DB_URL");
        }

        if (dbUrl == null || dbUrl.trim().isEmpty()) {
            // Default configuration for local development or testing
            return DataSourceBuilder.create()
                    .url("jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1")
                    .driverClassName("org.h2.Driver")
                    .username("sa")
                    .password("")
                    .build();
        }

        String jdbcUrl = dbUrl;
        if (dbUrl.startsWith("postgresql://")) {
            jdbcUrl = "jdbc:" + dbUrl;
        }

        // Try to parse credentials from the URI if username/password are empty
        if ((username == null || username.trim().isEmpty()) && dbUrl.startsWith("postgresql://")) {
            try {
                URI uri = new URI(dbUrl);
                String userInfo = uri.getUserInfo();
                if (userInfo != null) {
                    String[] parts = userInfo.split(":");
                    username = parts[0];
                    if (parts.length > 1) {
                        password = parts[1];
                    }
                }
            } catch (Exception e) {
                // Ignore parsing errors
            }
        }

        return DataSourceBuilder.create()
                .url(jdbcUrl)
                .username(username)
                .password(password)
                .driverClassName("org.postgresql.Driver")
                .build();
    }
}

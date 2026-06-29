package com.expensetracker.config;

import com.expensetracker.entity.User;
import com.expensetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DatabasePasswordMigration implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final DataSource dataSource;

    @Override
    public void run(String... args) {
        try (Connection conn = dataSource.getConnection()) {
            String url = conn.getMetaData().getURL();
            if (url == null || (!url.startsWith("jdbc:postgresql://") && !url.startsWith("jdbc:h2:"))) {
                throw new IllegalStateException("Database URL configuration is malformed or invalid: " + url);
            }
            
            String host = "unknown";
            String dbName = "unknown";
            if (url.startsWith("jdbc:postgresql://")) {
                String cleanUrl = url.substring("jdbc:postgresql://".length());
                int slashIdx = cleanUrl.indexOf('/');
                if (slashIdx != -1) {
                    String hostPort = cleanUrl.substring(0, slashIdx);
                    int colonIdx = hostPort.indexOf(':');
                    host = colonIdx != -1 ? hostPort.substring(0, colonIdx) : hostPort;
                    
                    String pathQuery = cleanUrl.substring(slashIdx + 1);
                    int qIdx = pathQuery.indexOf('?');
                    dbName = qIdx != -1 ? pathQuery.substring(0, qIdx) : pathQuery;
                }
            } else if (url.startsWith("jdbc:h2:")) {
                host = "in-memory-h2";
                dbName = url;
            }
            
            log.info("==========================================");
            log.info("DATABASE SECURITY OBSERVABILITY INFO:");
            log.info("Connected Host: {}", host);
            log.info("Database Name: {}", dbName);
            log.info("==========================================");
        } catch (Exception e) {
            log.error("CRITICAL: Database configuration validation failed", e);
            throw new RuntimeException("Database startup validation failed", e);
        }

        log.info("Checking if existing users need password hash upgrade...");
        List<User> users = userRepository.findAll();
        int upgradedCount = 0;
        for (User user : users) {
            String password = user.getPassword();
            if (password != null && !isBCrypt(password)) {
                log.info("Upgrading password hash for user: {}", user.getEmail());
                user.setPassword(passwordEncoder.encode(password));
                userRepository.save(user);
                upgradedCount++;
            }
        }
        if (upgradedCount > 0) {
            log.info("Successfully upgraded password hashes for {} users", upgradedCount);
        } else {
            log.info("All user passwords are already hashed using BCrypt");
        }
    }

    private boolean isBCrypt(String password) {
        if (password == null) {
            return false;
        }
        return password.startsWith("$2a$") || password.startsWith("$2b$") || password.startsWith("$2y$");
    }
}

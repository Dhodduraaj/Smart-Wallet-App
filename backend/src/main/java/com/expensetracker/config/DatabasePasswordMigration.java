package com.expensetracker.config;

import com.expensetracker.entity.User;
import com.expensetracker.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DatabasePasswordMigration implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
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

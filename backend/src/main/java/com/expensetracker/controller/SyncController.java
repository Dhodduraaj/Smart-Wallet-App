package com.expensetracker.controller;

import com.expensetracker.entity.User;
import com.expensetracker.entity.UserBackup;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.repository.UserBackupRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/sync")
@RequiredArgsConstructor
@Slf4j
public class SyncController {

    private final UserRepository userRepository;
    private final UserBackupRepository userBackupRepository;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, Object> request) {
        log.info("Received register request: {}", request);
        String localUserIdStr = (String) request.get("localUserId");
        String email = (String) request.get("email");
        
        if (localUserIdStr == null || email == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "localUserId and email are required"));
        }
        
        UUID localUserId = UUID.fromString(localUserIdStr);
        
        // Check if user already exists
        Optional<User> existingUser = userRepository.findById(localUserId);
        if (existingUser.isEmpty()) {
            // Check if email is already taken by another user ID (e.g. from previous installation)
            Optional<User> userByEmail = userRepository.findByEmail(email);
            if (userByEmail.isPresent()) {
                log.info("Email {} already exists under ID: {}. Informing client to pull.", email, userByEmail.get().getId());
                return ResponseEntity.ok(Map.of(
                    "status", "exists",
                    "message", "Email already registered. Please pull to restore.",
                    "userId", userByEmail.get().getId().toString()
                ));
            }
            
            User user = User.builder()
                    .id(localUserId)
                    .email(email)
                    .build();
            userRepository.save(user);
            log.info("Registered new user record: {}", email);
        }
        
        // Save full JSON backup
        try {
            String payload = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(request);
            UserBackup backup = userBackupRepository.findById(localUserId)
                    .orElse(new UserBackup());
            backup.setUserId(localUserId);
            backup.setPayload(payload);
            backup.setLastSync(LocalDateTime.now());
            userBackupRepository.save(backup);
            log.info("Saved user backup for {}", email);
        } catch (Exception e) {
            log.error("Failed to serialize and save backup", e);
            return ResponseEntity.internalServerError().body(Map.of("message", "Failed to store user backup"));
        }

        return ResponseEntity.ok(Map.of("status", "success", "message", "User backup registered successfully"));
    }

    @PostMapping("/update")
    public ResponseEntity<?> update(@RequestBody Map<String, Object> request) {
        log.info("Received update request: {}", request);
        String localUserIdStr = (String) request.get("localUserId");
        
        if (localUserIdStr == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "localUserId is required"));
        }
        
        UUID localUserId = UUID.fromString(localUserIdStr);
        
        // Create user if not exists (auto-register fallback)
        Optional<User> existingUser = userRepository.findById(localUserId);
        if (existingUser.isEmpty()) {
            String email = (String) request.get("email");
            if (email != null) {
                User user = User.builder()
                        .id(localUserId)
                        .email(email)
                        .build();
                userRepository.save(user);
                log.info("Auto-registered user during update: {}", email);
            } else {
                return ResponseEntity.badRequest().body(Map.of("message", "User not found and email is missing"));
            }
        }
        
        // Save full JSON backup
        try {
            String payload = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(request);
            UserBackup backup = userBackupRepository.findById(localUserId)
                    .orElse(new UserBackup());
            backup.setUserId(localUserId);
            backup.setPayload(payload);
            backup.setLastSync(LocalDateTime.now());
            userBackupRepository.save(backup);
            log.info("Updated backup payload for user ID: {}", localUserId);
        } catch (Exception e) {
            log.error("Failed to serialize and save backup update", e);
            return ResponseEntity.internalServerError().body(Map.of("message", "Failed to update backup"));
        }

        return ResponseEntity.ok(Map.of("status", "success", "message", "Backup updated successfully"));
    }

    @GetMapping("/pull")
    public ResponseEntity<?> pull(@RequestParam(required = false) String email, @RequestParam(required = false) String userId) {
        log.info("Received pull request: email={}, userId={}", email, userId);
        UUID targetUserId = null;
        
        if (userId != null && !userId.trim().isEmpty()) {
            targetUserId = UUID.fromString(userId);
        } else if (email != null && !email.trim().isEmpty()) {
            Optional<User> userOpt = userRepository.findByEmail(email);
            if (userOpt.isPresent()) {
                targetUserId = userOpt.get().getId();
            }
        }

        if (targetUserId == null) {
            log.warn("User lookup failed for pull: email={}, userId={}", email, userId);
            return ResponseEntity.status(404).body(Map.of("message", "User not found"));
        }

        Optional<UserBackup> backupOpt = userBackupRepository.findById(targetUserId);
        if (backupOpt.isPresent()) {
            log.info("Successfully retrieved backup for user ID: {}", targetUserId);
            return ResponseEntity.ok()
                    .header("Content-Type", "application/json")
                    .body(backupOpt.get().getPayload());
        }

        log.warn("No backup found for user ID: {}", targetUserId);
        return ResponseEntity.status(404).body(Map.of("message", "No backup found for this user"));
    }
}

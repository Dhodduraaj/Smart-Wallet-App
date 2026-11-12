package com.expensetracker.controller;

import com.expensetracker.dto.BatchSyncRequest;
import com.expensetracker.entity.User;
import com.expensetracker.entity.UserBackup;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.repository.UserBackupRepository;
import com.expensetracker.service.AccountRecoveryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping({"/api/sync", "/sync"})
@RequiredArgsConstructor
@Slf4j
public class SyncController {

    private final UserRepository userRepository;
    private final UserBackupRepository userBackupRepository;
    private final AccountRecoveryService accountRecoveryService;

    @PostMapping("/batch")
    public ResponseEntity<?> batchSync(@RequestBody BatchSyncRequest request) {
        log.info("Received batch sync request for user: {}", request != null ? request.getUserId() : "null");
        return accountRecoveryService.processBatchSync(request);
    }

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
                localUserId = userByEmail.get().getId();
                log.info("Email {} already exists under ID: {}. Linking local record to existing cloud user.", email, localUserId);
            } else {
                User user = User.builder()
                        .id(localUserId)
                        .email(email)
                        .onboardingCompleted(true)
                        .build();
                userRepository.save(user);
                log.info("Registered new user record: {}", email);
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
            log.info("Saved user backup for {}", email);
        } catch (Exception e) {
            log.error("Failed to serialize and save backup", e);
            return ResponseEntity.internalServerError().body(Map.of("message", "Failed to store user backup"));
        }

        // Sync relational tables if payload map is provided
        try {
            Object p = request.get("payload");
            if (p instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> payloadMap = (Map<String, Object>) p;
                accountRecoveryService.syncRelationalTables(localUserId, payloadMap, new HashMap<>());
            }
        } catch (Exception e) {
            log.warn("Non-fatal relational sync warning in SyncController.register: {}", e.getMessage());
        }

        return ResponseEntity.ok(Map.of("status", "success", "message", "User backup registered successfully", "userId", localUserId.toString()));
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
                Optional<User> userByEmail = userRepository.findByEmail(email);
                if (userByEmail.isPresent()) {
                    localUserId = userByEmail.get().getId();
                } else {
                    User user = User.builder()
                            .id(localUserId)
                            .email(email)
                            .onboardingCompleted(true)
                            .build();
                    userRepository.save(user);
                    log.info("Auto-registered user during update: {}", email);
                }
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

        // Sync relational tables if payload map is provided
        try {
            Object p = request.get("payload");
            if (p instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> payloadMap = (Map<String, Object>) p;
                accountRecoveryService.syncRelationalTables(localUserId, payloadMap, new HashMap<>());
            }
        } catch (Exception e) {
            log.warn("Non-fatal relational sync warning in SyncController.update: {}", e.getMessage());
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

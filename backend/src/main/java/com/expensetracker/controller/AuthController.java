package com.expensetracker.controller;

import com.expensetracker.dto.AccountRecoveryRequest;
import com.expensetracker.dto.AuthResponse;
import com.expensetracker.dto.LoginRequest;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.dto.UserDto;
import com.expensetracker.entity.User;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.security.JwtTokenProvider;
import com.expensetracker.service.AccountRecoveryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Authentication", description = "User authentication and authorization API")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final AccountRecoveryService accountRecoveryService;

    @PostMapping("/register")
    @Operation(summary = "Register a new user")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        String normalizedEmail = request.getEmail() != null ? request.getEmail().trim().toLowerCase() : "";
        if (normalizedEmail.isEmpty() || request.getPassword() == null || request.getPassword().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Email and password are required"));
        }

        Optional<User> existingUserOpt = userRepository.findByEmail(normalizedEmail);
        User user;

        if (existingUserOpt.isPresent()) {
            user = existingUserOpt.get();
            // If existing user already has a password set, do not allow duplicate registration
            if (user.getPassword() != null && !user.getPassword().trim().isEmpty()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("message", "Email is already registered. Please log in."));
            }
            // If user existed in backup without password, initialize their credentials
            user.setPassword(passwordEncoder.encode(request.getPassword()));
            if (request.getFullName() != null && !request.getFullName().trim().isEmpty()) {
                user.setFullName(request.getFullName().trim());
            }
            user = userRepository.save(user);
            log.info("Initialized password for existing legacy user: {}", normalizedEmail);
        } else {
            user = User.builder()
                    .id(UUID.randomUUID())
                    .email(normalizedEmail)
                    .fullName(request.getFullName() != null ? request.getFullName().trim() : normalizedEmail.split("@")[0])
                    .password(passwordEncoder.encode(request.getPassword()))
                    .onboardingCompleted(true)
                    .build();
            user = userRepository.save(user);
            log.info("Registered new user: {}", normalizedEmail);
        }

        String token = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getFullName());

        return ResponseEntity.status(HttpStatus.CREATED).body(AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .onboardingCompleted(true)
                .build());
    }

    @PostMapping("/login")
    @Operation(summary = "Log in with email and password")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        String normalizedEmail = request.getEmail() != null ? request.getEmail().trim().toLowerCase() : "";
        String rawPassword = request.getPassword() != null ? request.getPassword() : "";

        if (normalizedEmail.isEmpty() || rawPassword.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password"));
        }

        Optional<User> userOpt = userRepository.findByEmail(normalizedEmail);
        if (userOpt.isEmpty()) {
            log.warn("Login failed: User not found for email {}", normalizedEmail);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password", "userNotFound", true));
        }

        User user = userOpt.get();
        if (user.getPassword() == null || !passwordEncoder.matches(rawPassword, user.getPassword())) {
            log.warn("Login failed: Password mismatch for email {}", normalizedEmail);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password"));
        }

        log.info("Login successful for email: {}", normalizedEmail);
        String token = tokenProvider.generateToken(user.getId(), user.getEmail(), user.getFullName());

        return ResponseEntity.ok(AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .onboardingCompleted(true)
                .build());
    }

    @PostMapping("/recover-account")
    @Operation(summary = "Fast recover local offline account and establish session immediately")
    public ResponseEntity<?> recoverAccount(@RequestBody AccountRecoveryRequest request) {
        return accountRecoveryService.recoverAccountOnly(request);
    }

    @PostMapping("/recover-and-sync")
    @Operation(summary = "Recover local offline account and synchronize with Neon cloud")
    public ResponseEntity<?> recoverAndSync(@RequestBody AccountRecoveryRequest request) {
        return accountRecoveryService.recoverAndSync(request);
    }

    @GetMapping("/me")
    @Operation(summary = "Get current authenticated user profile")
    public ResponseEntity<?> getCurrentUser(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Authorization header missing or invalid"));
        }

        String token = authHeader.substring(7);
        if (!tokenProvider.validateToken(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid or expired session token"));
        }

        String email = tokenProvider.getEmailFromJWT(token);
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "User not found"));
        }

        User user = userOpt.get();
        return ResponseEntity.ok(UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .onboardingCompleted(true)
                .build());
    }
}

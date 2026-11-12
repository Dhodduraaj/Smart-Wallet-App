package com.expensetracker.controller;

import com.expensetracker.dto.AccountRecoveryRequest;
import com.expensetracker.dto.LoginRequest;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.entity.User;
import com.expensetracker.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    private static final String TEST_EMAIL = "auth_test_user@example.com";
    private static final String TEST_PASSWORD = "CorrectSecurePassword123!";

    @BeforeEach
    void setUp() {
        userRepository.findByEmail(TEST_EMAIL).ifPresent(userRepository::delete);
        
        User testUser = User.builder()
                .id(UUID.randomUUID())
                .email(TEST_EMAIL)
                .fullName("Auth Test User")
                .password(passwordEncoder.encode(TEST_PASSWORD))
                .build();
        userRepository.save(testUser);
    }

    @Test
    @DisplayName("Scenario 1: Correct email + correct password -> Login successful (HTTP 200)")
    void testLoginWithCorrectCredentials() throws Exception {
        LoginRequest request = LoginRequest.builder()
                .email(TEST_EMAIL)
                .password(TEST_PASSWORD)
                .build();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.email").value(TEST_EMAIL))
                .andExpect(jsonPath("$.fullName").value("Auth Test User"));
    }

    @Test
    @DisplayName("Scenario 2: Correct email + incorrect password -> Rejected (HTTP 401)")
    void testLoginWithIncorrectPassword() throws Exception {
        LoginRequest request = LoginRequest.builder()
                .email(TEST_EMAIL)
                .password("WrongPassword999")
                .build();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    @Test
    @DisplayName("Scenario 3: Correct email + completely random password -> Rejected (HTTP 401)")
    void testLoginWithRandomPassword() throws Exception {
        LoginRequest request = LoginRequest.builder()
                .email(TEST_EMAIL)
                .password("random_junk_qwerty_xyz_12345")
                .build();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    @Test
    @DisplayName("Scenario 4: Non-existent email -> Rejected (HTTP 401)")
    void testLoginWithNonExistentEmail() throws Exception {
        LoginRequest request = LoginRequest.builder()
                .email("doesnotexist_never_ever@example.com")
                .password("AnyPassword123")
                .build();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    @Test
    @DisplayName("Scenario 5: Empty email or password -> Rejected (HTTP 401)")
    void testLoginWithEmptyFields() throws Exception {
        LoginRequest request = LoginRequest.builder()
                .email(TEST_EMAIL)
                .password("")
                .build();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Scenario 6: Valid JWT token in Authorization header -> Restores session (HTTP 200)")
    void testGetCurrentUserWithValidToken() throws Exception {
        // 1. Log in to get token
        LoginRequest loginRequest = LoginRequest.builder()
                .email(TEST_EMAIL)
                .password(TEST_PASSWORD)
                .build();

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginRequest)))
                .andExpect(status().isOk())
                .andReturn();

        String responseBody = loginResult.getResponse().getContentAsString();
        String token = objectMapper.readTree(responseBody).get("token").asText();

        // 2. Call /api/auth/me with Bearer token
        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(TEST_EMAIL))
                .andExpect(jsonPath("$.fullName").value("Auth Test User"));
    }

    @Test
    @DisplayName("Scenario 7: Invalid or tampered token in Authorization header -> Rejected (HTTP 401)")
    void testGetCurrentUserWithInvalidToken() throws Exception {
        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer invalid.jwt.token.here"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Scenario 8: New registration -> Creates user and returns token (HTTP 201)")
    void testRegisterNewUser() throws Exception {
        String newEmail = "brand_new_user_" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        RegisterRequest registerRequest = RegisterRequest.builder()
                .fullName("Brand New User")
                .email(newEmail)
                .password("BrandNewPass123")
                .build();

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.email").value(newEmail));

        // Clean up
        userRepository.findByEmail(newEmail).ifPresent(userRepository::delete);
    }

    @Test
    @DisplayName("Scenario 9: Account Recovery - New local user recovered and synchronized to cloud")
    void testRecoverAndSyncNewUser() throws Exception {
        String recoveryEmail = "recover_new_" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        UUID localUserId = UUID.randomUUID();
        UUID cashAccId = UUID.randomUUID();
        UUID expId = UUID.randomUUID();

        java.util.Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("accounts", java.util.List.of(java.util.Map.of(
                "id", cashAccId.toString(),
                "accountName", "Cash",
                "accountType", "SYSTEM",
                "currentBalance", 500
        )));
        payload.put("expenses", java.util.List.of(java.util.Map.of(
                "id", expId.toString(),
                "amount", 150,
                "category", "Food",
                "description", "Dinner",
                "expenseDate", "2026-11-10",
                "paymentMode", "CASH",
                "accountId", cashAccId.toString()
        )));
        payload.put("people", java.util.List.of(java.util.Map.of("id", "p1", "name", "Alice")));
        payload.put("peopleLedger", java.util.List.of(java.util.Map.of("id", "pl1", "personId", "p1", "incomingMoney", 100)));

        AccountRecoveryRequest recoveryRequest = AccountRecoveryRequest.builder()
                .email(recoveryEmail)
                .password("StrongPass123!")
                .localUserId(localUserId.toString())
                .fullName("Recovered User")
                .payload(payload)
                .build();

        mockMvc.perform(post("/api/auth/recover-and-sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recoveryRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.userId").value(localUserId.toString()))
                .andExpect(jsonPath("$.email").value(recoveryEmail))
                .andExpect(jsonPath("$.syncedCounts.expenses").value(1))
                .andExpect(jsonPath("$.syncedCounts.accounts").value(1))
                .andExpect(jsonPath("$.syncedCounts.people").value(1))
                .andExpect(jsonPath("$.syncedCounts.peopleLedger").value(1));

        // Clean up
        userRepository.findByEmail(recoveryEmail).ifPresent(userRepository::delete);
    }

    @Test
    @DisplayName("Scenario 10: Account Recovery - Existing cloud user with correct password reconciles data")
    void testRecoverAndSyncExistingUserCorrectPassword() throws Exception {
        AccountRecoveryRequest recoveryRequest = AccountRecoveryRequest.builder()
                .email(TEST_EMAIL)
                .password(TEST_PASSWORD)
                .fullName("Auth Test User")
                .payload(java.util.Map.of("expenses", java.util.List.of()))
                .build();

        mockMvc.perform(post("/api/auth/recover-and-sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recoveryRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", notNullValue()))
                .andExpect(jsonPath("$.email").value(TEST_EMAIL));
    }

    @Test
    @DisplayName("Scenario 11: Account Recovery - Existing cloud user with WRONG password rejected (HTTP 401)")
    void testRecoverAndSyncExistingUserWrongPassword() throws Exception {
        AccountRecoveryRequest recoveryRequest = AccountRecoveryRequest.builder()
                .email(TEST_EMAIL)
                .password("TotallyWrongPassword999!")
                .fullName("Auth Test User")
                .payload(java.util.Map.of())
                .build();

        mockMvc.perform(post("/api/auth/recover-and-sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(recoveryRequest)))
                .andExpect(status().isUnauthorized());
    }
}


package com.expensetracker.controller;

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
}

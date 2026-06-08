package com.expensetracker.service;

import com.expensetracker.dto.AuthResponse;
import com.expensetracker.dto.InitialAccountDto;
import com.expensetracker.dto.LoginRequest;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.entity.Account;
import com.expensetracker.entity.DailyReminderConfig;
import com.expensetracker.entity.User;
import com.expensetracker.exception.BadRequestException;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.DailyReminderConfigRepository;
import com.expensetracker.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class UserServiceTest {

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AccountRepository accountRepository;

    @Autowired
    private DailyReminderConfigRepository dailyReminderConfigRepository;

    @BeforeEach
    void setUp() {
        accountRepository.deleteAll();
        dailyReminderConfigRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void registerUserSuccess() {
        RegisterRequest request = RegisterRequest.builder()
                .fullName("John Doe")
                .email("john@example.com")
                .password("password123")
                .build();

        AuthResponse response = userService.register(request);

        assertNotNull(response);
        assertNotNull(response.getToken());
        assertEquals("john@example.com", response.getEmail());
        assertEquals("John Doe", response.getFullName());
        assertNotNull(response.getUserId());

        Optional<User> userOpt = userRepository.findById(response.getUserId());
        assertTrue(userOpt.isPresent());
        assertEquals("john@example.com", userOpt.get().getEmail());

        Optional<DailyReminderConfig> configOpt = dailyReminderConfigRepository.findByUserId(response.getUserId());
        assertTrue(configOpt.isPresent());
        assertFalse(configOpt.get().isEnabled());

        List<Account> accounts = accountRepository.findByUserId(response.getUserId());
        assertEquals(1, accounts.size());
        assertEquals("Cash", accounts.get(0).getAccountName());
        assertEquals("CASH", accounts.get(0).getAccountType());
        assertEquals(0, BigDecimal.ZERO.compareTo(accounts.get(0).getCurrentBalance()));
    }

    @Test
    void registerWithInitialBankAccount() {
        InitialAccountDto bank = InitialAccountDto.builder()
                .accountName("SBI Savings")
                .accountType("BANK")
                .currentBalance(new BigDecimal("5000.00"))
                .build();

        RegisterRequest request = RegisterRequest.builder()
                .fullName("Jane Doe")
                .email("jane@example.com")
                .password("password123")
                .initialAccounts(Collections.singletonList(bank))
                .build();

        AuthResponse response = userService.register(request);
        List<Account> accounts = accountRepository.findByUserId(response.getUserId());
        assertEquals(2, accounts.size());
        assertTrue(accounts.stream().anyMatch(a -> "CASH".equals(a.getAccountType())));
        assertTrue(accounts.stream().anyMatch(a -> "SBI Savings".equals(a.getAccountName())));
    }

    @Test
    void registerUserDuplicateEmail() {
        RegisterRequest request = RegisterRequest.builder()
                .fullName("John Doe")
                .email("john@example.com")
                .password("password123")
                .build();

        userService.register(request);

        // Try registering again with the same email
        assertThrows(BadRequestException.class, () -> userService.register(request));
    }

    @Test
    void loginUserSuccess() {
        RegisterRequest registerRequest = RegisterRequest.builder()
                .fullName("John Doe")
                .email("john@example.com")
                .password("password123")
                .build();
        AuthResponse registered = userService.register(registerRequest);

        accountRepository.deleteAll();
        assertTrue(accountRepository.findByUserId(registered.getUserId()).isEmpty());

        LoginRequest loginRequest = LoginRequest.builder()
                .email("john@example.com")
                .password("password123")
                .build();

        AuthResponse response = userService.login(loginRequest);

        assertNotNull(response);
        assertNotNull(response.getToken());
        assertEquals("john@example.com", response.getEmail());

        List<Account> accounts = accountRepository.findByUserId(registered.getUserId());
        assertEquals(1, accounts.size());
        assertEquals("CASH", accounts.get(0).getAccountType());
    }

    @Test
    void loginUserWrongPassword() {
        RegisterRequest registerRequest = RegisterRequest.builder()
                .fullName("John Doe")
                .email("john@example.com")
                .password("password123")
                .build();
        userService.register(registerRequest);

        LoginRequest loginRequest = LoginRequest.builder()
                .email("john@example.com")
                .password("wrongpassword")
                .build();

        assertThrows(BadCredentialsException.class, () -> userService.login(loginRequest));
    }
}

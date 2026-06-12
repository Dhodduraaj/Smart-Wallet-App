package com.expensetracker.service.impl;

import com.expensetracker.dto.AuthResponse;
import com.expensetracker.dto.LoginRequest;
import com.expensetracker.dto.OnboardingRequest;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.dto.UserDto;
import com.expensetracker.entity.Account;
import com.expensetracker.entity.DailyReminderConfig;
import com.expensetracker.entity.User;
import com.expensetracker.exception.BadRequestException;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.AccountRepository;
import com.expensetracker.repository.DailyReminderConfigRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.security.JwtTokenProvider;
import com.expensetracker.service.DefaultCashAccountService;
import com.expensetracker.dto.ChangePasswordRequest;
import com.expensetracker.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final AccountRepository accountRepository;
    private final DailyReminderConfigRepository dailyReminderConfigRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;
    private final DefaultCashAccountService defaultCashAccountService;

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest registerRequest) {
        if (userRepository.existsByEmail(registerRequest.getEmail())) {
            throw new BadRequestException("Email is already registered");
        }

        User user = User.builder()
                .fullName(registerRequest.getFullName())
                .email(registerRequest.getEmail())
                .password(passwordEncoder.encode(registerRequest.getPassword()))
                .onboardingCompleted(false)
                .build();
        user = userRepository.save(user);

        DailyReminderConfig config = DailyReminderConfig.builder()
                .user(user)
                .enabled(false)
                .reminderTime(java.time.LocalTime.of(15, 30)) // 21:00 IST in UTC
                .reminderZoneId("Asia/Kolkata")
                .build();
        dailyReminderConfigRepository.save(config);

        defaultCashAccountService.ensureForUser(user);

        if (registerRequest.getInitialAccounts() != null && !registerRequest.getInitialAccounts().isEmpty()) {
            User finalUser = user;
            registerRequest.getInitialAccounts().stream()
                    .filter(accDto -> !DefaultCashAccountService.CASH_ACCOUNT_TYPE
                            .equalsIgnoreCase(accDto.getAccountType()))
                    .forEach(accDto -> {
                        Account account = Account.builder()
                                .user(finalUser)
                                .accountName(accDto.getAccountName())
                                .accountType(accDto.getAccountType())
                                .currentBalance(accDto.getCurrentBalance())
                                .build();
                        accountRepository.save(account);
                    });
        }

        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(registerRequest.getEmail(), registerRequest.getPassword())
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);
        String token = tokenProvider.generateToken(authentication);

        return AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .onboardingCompleted(user.getOnboardingCompleted())
                .avatar(user.getAvatar())
                .build();
    }

    @Override
    @Transactional
    public AuthResponse login(LoginRequest loginRequest) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(loginRequest.getEmail(), loginRequest.getPassword())
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String token = tokenProvider.generateToken(authentication);

        User user = userRepository.findByEmail(loginRequest.getEmail())
                .orElseThrow(() -> new BadRequestException("User not found"));

        defaultCashAccountService.ensureForUser(user);

        return AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .onboardingCompleted(user.getOnboardingCompleted())
                .avatar(user.getAvatar())
                .build();
    }

    @Override
    @Transactional
    public void completeOnboarding(UUID userId, OnboardingRequest onboardingRequest) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BadRequestException("User not found"));

        defaultCashAccountService.ensureForUser(user);

        user.setOnboardingCompleted(true);
        userRepository.save(user);

        if (onboardingRequest != null && onboardingRequest.getAccounts() != null && !onboardingRequest.getAccounts().isEmpty()) {
            onboardingRequest.getAccounts().stream()
                    .filter(accDto -> !DefaultCashAccountService.CASH_ACCOUNT_TYPE
                            .equalsIgnoreCase(accDto.getAccountType()))
                    .forEach(accDto -> {
                        Account account = Account.builder()
                                .user(user)
                                .accountName(accDto.getAccountName())
                                .accountType(accDto.getAccountType())
                                .currentBalance(accDto.getCurrentBalance())
                                .build();
                        accountRepository.save(account);
                    });
        }
    }

    @Override
    @Transactional
    public UserDto getUserById(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        defaultCashAccountService.ensureForUser(user);

        return UserDto.builder()
                .id(user.getId())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .createdAt(user.getCreatedAt())
                .onboardingCompleted(user.getOnboardingCompleted())
                .avatar(user.getAvatar())
                .build();
    }

    @Override
    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new BadRequestException("Current password is incorrect");
        }

        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            throw new BadRequestException("New password and confirmation do not match");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    @Override
    @Transactional
    public void updateAvatar(UUID userId, String avatar) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        user.setAvatar(avatar);
        userRepository.save(user);
    }
}

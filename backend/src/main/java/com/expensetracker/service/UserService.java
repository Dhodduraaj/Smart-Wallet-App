package com.expensetracker.service;

import com.expensetracker.dto.AuthResponse;
import com.expensetracker.dto.LoginRequest;
import com.expensetracker.dto.OnboardingRequest;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.dto.UserDto;

import com.expensetracker.dto.ChangePasswordRequest;

import java.util.UUID;

public interface UserService {
    AuthResponse register(RegisterRequest registerRequest);
    AuthResponse login(LoginRequest loginRequest);
    void completeOnboarding(UUID userId, OnboardingRequest onboardingRequest);
    UserDto getUserById(UUID userId);
    void changePassword(UUID userId, ChangePasswordRequest request);
    UserDto updateAvatar(UUID userId, String avatar);
}

package com.expensetracker.service;

import com.expensetracker.dto.FcmTokenRequest;

import java.util.UUID;

public interface FcmTokenService {
    void registerToken(UUID userId, FcmTokenRequest request, String userAgent);
    void unregisterToken(UUID userId, String token);
}

package com.expensetracker.service.impl;

import com.expensetracker.dto.FcmTokenRequest;
import com.expensetracker.entity.FcmDeviceToken;
import com.expensetracker.entity.User;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.FcmDeviceTokenRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.service.FcmTokenService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class FcmTokenServiceImpl implements FcmTokenService {

    private final FcmDeviceTokenRepository fcmDeviceTokenRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public void registerToken(UUID userId, FcmTokenRequest request, String userAgent) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        fcmDeviceTokenRepository.findByFcmToken(request.getToken()).ifPresentOrElse(existing -> {
            existing.setUser(user);
            fcmDeviceTokenRepository.save(existing);
            log.info("FCM token re-associated for user {} token {}", userId, maskToken(request.getToken()));
        }, () -> fcmDeviceTokenRepository.save(FcmDeviceToken.builder()
                .user(user)
                .fcmToken(request.getToken())
                .build()));
        log.info("FCM token registered for user {} token {}", userId, maskToken(request.getToken()));
    }

    @Override
    @Transactional
    public void unregisterToken(UUID userId, String token) {
        fcmDeviceTokenRepository.findByFcmToken(token).ifPresent(existing -> {
            if (existing.getUser().getId().equals(userId)) {
                fcmDeviceTokenRepository.delete(existing);
                log.info("FCM token unregistered for user {} token {}", userId, maskToken(token));
            }
        });
    }

    private String maskToken(String token) {
        if (token == null || token.length() < 12) {
            return "****";
        }
        return token.substring(0, 8) + "...";
    }
}

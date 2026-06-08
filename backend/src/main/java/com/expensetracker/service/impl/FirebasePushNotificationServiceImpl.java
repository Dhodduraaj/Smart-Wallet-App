package com.expensetracker.service.impl;

import com.expensetracker.entity.FcmDeviceToken;
import com.expensetracker.repository.FcmDeviceTokenRepository;
import com.expensetracker.service.PushNotificationService;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class FirebasePushNotificationServiceImpl implements PushNotificationService {

    private final FcmDeviceTokenRepository fcmDeviceTokenRepository;

    @Override
    public boolean isAvailable() {
        return FirebaseApp.getApps().stream().anyMatch(app -> FirebaseApp.DEFAULT_APP_NAME.equals(app.getName()));
    }

    @Override
    public int sendToUser(UUID userId, String title, String body, Map<String, String> data) {
        if (!isAvailable()) {
            log.debug("FCM not configured; skipping push for user {}", userId);
            return 0;
        }

        List<FcmDeviceToken> devices = fcmDeviceTokenRepository.findByUserId(userId);
        if (devices.isEmpty()) {
            return 0;
        }

        int successCount = 0;
        List<String> invalidTokens = new ArrayList<>();

        for (FcmDeviceToken device : devices) {
            Message message = Message.builder()
                    .setToken(device.getFcmToken())
                    .putAllData(buildDataPayload(title, body, data))
                    .build();
            try {
                log.info("FCM send attempt user {} token {}", userId, maskToken(device.getFcmToken()));
                FirebaseMessaging.getInstance().send(message);
                successCount++;
            } catch (FirebaseMessagingException e) {
                MessagingErrorCode code = e.getMessagingErrorCode();
                if (code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT) {
                    invalidTokens.add(device.getFcmToken());
                }
                log.warn("FCM send failed for user {} token [{}]: {}", userId, device.getId(), e.getMessage());
            }
        }

        invalidTokens.forEach(token -> {
            fcmDeviceTokenRepository.findByFcmToken(token).ifPresent(fcmDeviceTokenRepository::delete);
            log.info("Removed invalid FCM token for user {}", userId);
        });

        log.info("FCM sent to user {}: {} success, {} failure", userId, successCount, devices.size() - successCount);
        return successCount;
    }

    private Map<String, String> buildDataPayload(String title, String body, Map<String, String> data) {
        Map<String, String> payload = new java.util.HashMap<>();
        payload.put("title", title);
        payload.put("body", body);
        if (data != null) {
            payload.putAll(data);
        }
        return payload;
    }

    private String maskToken(String token) {
        if (token == null || token.length() < 12) {
            return "****";
        }
        return token.substring(0, 8) + "...";
    }
}

package com.expensetracker.service;

import java.util.Map;
import java.util.UUID;

public interface PushNotificationService {

    /**
     * Sends a push notification to every registered device for the user.
     *
     * @return number of devices that accepted the message
     */
    int sendToUser(UUID userId, String title, String body, Map<String, String> data);

    boolean isAvailable();
}

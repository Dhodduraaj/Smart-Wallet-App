package com.expensetracker.controller;

import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.PushNotificationService;
import com.expensetracker.service.ReminderService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/debug")
@RequiredArgsConstructor
public class PushDebugController {

    private final PushNotificationService pushNotificationService;
    private final ReminderService reminderService;

    @PostMapping("/push")
    public ResponseEntity<Map<String, Object>> sendDebugPush(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        int sent = pushNotificationService.sendToUser(
                userDetails.getId(),
                "Debug Reminder",
                "Test push from /api/debug/push",
                Map.of(
                        "type", "REMINDER",
                        "source", "debug"
                )
        );
        return ResponseEntity.ok(Map.of(
                "sentCount", sent,
                "firebaseAvailable", pushNotificationService.isAvailable()
        ));
    }

    /**
     * Manually runs the same logic as the minute scheduler (daily + upcoming). Safe for Render/debug.
     */
    @PostMapping("/trigger-reminders")
    public ResponseEntity<Map<String, Object>> triggerPendingReminders(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        int processed = reminderService.processPendingReminders();
        return ResponseEntity.ok(Map.of(
                "processed", processed,
                "message", "Triggered daily + upcoming reminder processing"
        ));
    }
}

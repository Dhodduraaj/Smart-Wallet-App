package com.expensetracker.scheduler;

import com.expensetracker.service.ReminderService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class ReminderScheduler {

    private final ReminderService reminderService;

    @PostConstruct
    void logSchedulerReady() {
        log.info("ReminderScheduler active: fixedRate=60000ms (daily + upcoming reminders)");
    }

    /**
     * Polls every minute while the app is running (Render-friendly fixedRate).
     * Daily reminders re-fire on each calendar day at the user's wall-clock time while enabled.
     */
    @Scheduled(fixedRate = 60000, initialDelay = 15000)
    public void runReminderChecks() {
        log.info("ReminderScheduler tick: invoking processPendingReminders()");
        try {
            reminderService.processPendingReminders();
        } catch (Exception e) {
            log.error("ReminderScheduler tick failed", e);
        }
    }
}

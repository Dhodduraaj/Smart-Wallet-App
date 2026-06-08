package com.expensetracker.service;

import com.expensetracker.dto.DailyReminderConfigDto;
import com.expensetracker.dto.UpcomingPaymentDto;

import java.util.List;
import java.util.UUID;

public interface ReminderService {
    DailyReminderConfigDto getDailyReminderConfig(UUID userId);
    DailyReminderConfigDto updateDailyReminderConfig(UUID userId, DailyReminderConfigDto configDto);

    List<UpcomingPaymentDto> getUpcomingPayments(UUID userId);
    UpcomingPaymentDto getUpcomingPayment(UUID userId, UUID id);
    UpcomingPaymentDto createUpcomingPayment(UUID userId, UpcomingPaymentDto paymentDto);
    UpcomingPaymentDto updateUpcomingPayment(UUID userId, UUID id, UpcomingPaymentDto paymentDto);
    void deleteUpcomingPayment(UUID userId, UUID id);
    UpcomingPaymentDto markCompleted(UUID userId, UUID id, boolean completed);

    /** Fires due daily reminders (timezone-aware). */
    void sendDailyExpenseReminders();

    void sendUpcomingPaymentReminders();

    /** Manual/debug: process all due reminders now (daily + upcoming). */
    int processPendingReminders();
}

package com.expensetracker.service.impl;

import com.expensetracker.dto.DailyReminderConfigDto;
import com.expensetracker.dto.UpcomingPaymentDto;
import com.expensetracker.entity.DailyReminderConfig;
import com.expensetracker.entity.UpcomingPayment;
import com.expensetracker.entity.User;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.DailyReminderConfigRepository;
import com.expensetracker.repository.UpcomingPaymentRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.service.EmailService;
import com.expensetracker.service.PushNotificationService;
import com.expensetracker.service.ReminderService;
import com.expensetracker.service.reminder.DailyReminderTiming;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReminderServiceImpl implements ReminderService {

    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final String DEFAULT_ZONE_ID = "Asia/Kolkata";
    private static final ZoneId DEFAULT_USER_ZONE = ZoneId.of(DEFAULT_ZONE_ID);

    private final DailyReminderConfigRepository dailyConfigRepository;
    private final UpcomingPaymentRepository upcomingPaymentRepository;
    private final UserRepository userRepository;
    private final EmailService emailService;
    private final PushNotificationService pushNotificationService;

    @Override
    @Transactional(readOnly = true)
    public DailyReminderConfigDto getDailyReminderConfig(UUID userId) {
        DailyReminderConfig config = dailyConfigRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Daily reminder config not found"));
        return mapToDto(config);
    }

    @Override
    @Transactional
    public DailyReminderConfigDto updateDailyReminderConfig(UUID userId, DailyReminderConfigDto configDto) {
        DailyReminderConfig config = dailyConfigRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Daily reminder config not found"));

        ZoneId userZone = resolveZone(configDto.getReminderZoneId());
        LocalTime wallTime = configDto.getReminderTime();
        LocalTime utcTrigger = DailyReminderTiming.wallTimeToUtc(wallTime, userZone);

        boolean scheduleChanged = config.isEnabled() != configDto.isEnabled()
                || !config.getReminderTime().equals(utcTrigger)
                || !config.getReminderZoneId().equals(userZone.getId());

        config.setEnabled(configDto.isEnabled());
        config.setReminderTime(utcTrigger);
        config.setReminderZoneId(userZone.getId());
        if (scheduleChanged) {
            // Allow same-day re-fire when user changes time, zone, or enabled state.
            config.setLastTriggeredAt(null);
        }
        config = dailyConfigRepository.save(config);

        log.info(
                "Daily reminder updated userId={} wallTime={} zone={} storedUtc={}",
                userId, wallTime, userZone.getId(), utcTrigger
        );
        return mapToDto(config);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UpcomingPaymentDto> getUpcomingPayments(UUID userId) {
        return upcomingPaymentRepository.findByUserId(userId).stream()
                .map(this::mapToDto)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public UpcomingPaymentDto getUpcomingPayment(UUID userId, UUID id) {
        UpcomingPayment payment = upcomingPaymentRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Upcoming payment not found with id: " + id));
        return mapToDto(payment);
    }

    @Override
    @Transactional
    public UpcomingPaymentDto createUpcomingPayment(UUID userId, UpcomingPaymentDto paymentDto) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UpcomingPayment payment = UpcomingPayment.builder()
                .user(user)
                .title(paymentDto.getTitle())
                .description(paymentDto.getDescription())
                .amount(paymentDto.getAmount())
                .dueDate(paymentDto.getDueDate())
                .reminderDate(paymentDto.getReminderDate())
                .completed(false)
                .reminderNotified(false)
                .build();

        payment = upcomingPaymentRepository.save(payment);
        return mapToDto(payment);
    }

    @Override
    @Transactional
    public UpcomingPaymentDto updateUpcomingPayment(UUID userId, UUID id, UpcomingPaymentDto paymentDto) {
        UpcomingPayment payment = upcomingPaymentRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Upcoming payment not found with id: " + id));

        LocalDate previousReminderDate = payment.getReminderDate();

        payment.setTitle(paymentDto.getTitle());
        payment.setDescription(paymentDto.getDescription());
        payment.setAmount(paymentDto.getAmount());
        payment.setDueDate(paymentDto.getDueDate());
        payment.setReminderDate(paymentDto.getReminderDate());
        payment.setCompleted(paymentDto.isCompleted());

        if (!paymentDto.getReminderDate().equals(previousReminderDate)) {
            payment.setReminderNotified(false);
        }

        payment = upcomingPaymentRepository.save(payment);
        return mapToDto(payment);
    }

    @Override
    @Transactional
    public void deleteUpcomingPayment(UUID userId, UUID id) {
        UpcomingPayment payment = upcomingPaymentRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Upcoming payment not found with id: " + id));
        upcomingPaymentRepository.delete(payment);
    }

    @Override
    @Transactional
    public UpcomingPaymentDto markCompleted(UUID userId, UUID id, boolean completed) {
        UpcomingPayment payment = upcomingPaymentRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Upcoming payment not found with id: " + id));

        payment.setCompleted(completed);
        payment = upcomingPaymentRepository.save(payment);
        return mapToDto(payment);
    }

    @Override
    @Transactional
    public void sendDailyExpenseReminders() {
        log.info("Reminder job triggered: processing daily expense reminders");

        List<DailyReminderConfig> configs;
        try {
            configs = dailyConfigRepository.findEnabledWithUser();
        } catch (Exception e) {
            log.error("Reminder fetch failed — check DB migration for reminder_zone_id", e);
            throw e;
        }

        log.info("Enabled daily reminder configs fetched: count={}", configs.size());

        for (DailyReminderConfig config : configs) {
            UUID userId = config.getUser().getId();
            try {
                processDailyReminderForUser(config);
            } catch (Exception e) {
                log.error("Reminder skipped due to error userId={}", userId, e);
            }
        }
    }

    private void processDailyReminderForUser(DailyReminderConfig config) {
        ZoneId userZone = resolveZone(config.getReminderZoneId());
        ZonedDateTime nowInZone = ZonedDateTime.now(userZone);
        LocalTime triggerWall = DailyReminderTiming.utcToWall(config.getReminderTime(), userZone);

        log.info(
                "Reminder check userId={} zone={} nowInZone={} triggerWall={} enabled={} lastTriggeredAt={}",
                config.getUser().getId(),
                userZone.getId(),
                nowInZone.toLocalTime(),
                triggerWall,
                config.isEnabled(),
                config.getLastTriggeredAt()
        );

        if (!DailyReminderTiming.isDueNow(config, userZone, nowInZone, triggerWall)) {
            return;
        }

        log.info("Daily reminder due userId={} zone={} triggerWall={}", config.getUser().getId(), userZone.getId(), triggerWall);
        sendDailyPush(config);
        config.setLastTriggeredAt(DailyReminderTiming.nowUtc());
        dailyConfigRepository.save(config);
    }

    @Override
    @Transactional
    public void sendUpcomingPaymentReminders() {
        log.info("Reminder job triggered: processing upcoming payment reminders");
        LocalDate today = LocalDate.now(UTC);
        List<UpcomingPayment> pendingPayments = upcomingPaymentRepository.findPendingRemindersForDate(today);
        log.info("Upcoming payment reminders fetched: count={} dateUtc={}", pendingPayments.size(), today);

        for (UpcomingPayment payment : pendingPayments) {
            try {
                processUpcomingPaymentReminder(payment);
            } catch (Exception e) {
                log.error("Upcoming reminder skipped paymentId={}", payment.getId(), e);
            }
        }
    }

    private void processUpcomingPaymentReminder(UpcomingPayment payment) {
        User user = payment.getUser();
        log.info("Reminder matched upcoming paymentId={} userId={}", payment.getId(), user.getId());

        String subject = String.format("Payment Reminder: %s", payment.getTitle());
        String body = String.format(
                "Hi %s,\n\nThis is a friendly reminder that your upcoming payment is scheduled for notification today:\n\n" +
                        "Title: %s\n" +
                        "Description: %s\n" +
                        "Amount: ₹%s\n" +
                        "Due Date: %s\n\n" +
                        "Please log into the app to complete this payment and mark it as completed.\n\n" +
                        "Best regards,\nYour Expense Tracker team",
                user.getFullName(),
                payment.getTitle(),
                payment.getDescription() != null ? payment.getDescription() : "N/A",
                payment.getAmount(),
                payment.getDueDate()
        );
        emailService.sendEmail(user.getEmail(), subject, body);

        log.info("Sending reminder push userId={} paymentId={}", user.getId(), payment.getId());
        int sent = pushNotificationService.sendToUser(
                user.getId(),
                "Payment reminder: " + payment.getTitle(),
                String.format("₹%s due on %s", payment.getAmount(), payment.getDueDate()),
                Map.of(
                        "type", "REMINDER",
                        "paymentId", payment.getId().toString()
                )
        );
        log.info("Reminder push sent userId={} devicesSent={}", user.getId(), sent);

        payment.setReminderNotified(true);
        upcomingPaymentRepository.save(payment);
    }

    @Override
    @Transactional
    public int processPendingReminders() {
        log.info("Reminder job triggered: processPendingReminders (manual + scheduler)");
        try {
            sendDailyExpenseReminders();
        } catch (Exception e) {
            log.error("Daily reminder batch failed", e);
        }
        try {
            sendUpcomingPaymentReminders();
        } catch (Exception e) {
            log.error("Upcoming reminder batch failed", e);
        }
        return 0;
    }

    private void sendDailyPush(DailyReminderConfig config) {
        User user = config.getUser();
        log.info("Sending reminder push userId={}", user.getId());

        int sent = pushNotificationService.sendToUser(
                user.getId(),
                "Reminder",
                "Time to log your expenses",
                Map.of(
                        "type", "REMINDER",
                        "source", "scheduler"
                )
        );
        log.info("Reminder push sent userId={} devicesSent={}", user.getId(), sent);
    }

    private ZoneId resolveZone(String zoneId) {
        if (zoneId == null || zoneId.isBlank()) {
            return DEFAULT_USER_ZONE;
        }
        try {
            return ZoneId.of(zoneId);
        } catch (Exception e) {
            log.warn("Invalid reminder_zone_id '{}', using default {}", zoneId, DEFAULT_ZONE_ID);
            return DEFAULT_USER_ZONE;
        }
    }

    private DailyReminderConfigDto mapToDto(DailyReminderConfig config) {
        ZoneId userZone = resolveZone(config.getReminderZoneId());
        return DailyReminderConfigDto.builder()
                .enabled(config.isEnabled())
                .reminderTime(DailyReminderTiming.utcToWall(config.getReminderTime(), userZone))
                .reminderZoneId(userZone.getId())
                .build();
    }

    private UpcomingPaymentDto mapToDto(UpcomingPayment payment) {
        return UpcomingPaymentDto.builder()
                .id(payment.getId())
                .title(payment.getTitle())
                .description(payment.getDescription())
                .amount(payment.getAmount())
                .dueDate(payment.getDueDate())
                .reminderDate(payment.getReminderDate())
                .completed(payment.isCompleted())
                .createdAt(payment.getCreatedAt())
                .build();
    }
}

package com.expensetracker.service;

import com.expensetracker.dto.DailyReminderConfigDto;
import com.expensetracker.dto.RegisterRequest;
import com.expensetracker.dto.UpcomingPaymentDto;
import com.expensetracker.repository.DailyReminderConfigRepository;
import com.expensetracker.repository.UpcomingPaymentRepository;
import com.expensetracker.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ReminderServiceTest {

    @Autowired
    private ReminderService reminderService;

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private DailyReminderConfigRepository dailyConfigRepository;

    @Autowired
    private UpcomingPaymentRepository upcomingPaymentRepository;

    private UUID userId;

    @BeforeEach
    void setUp() {
        upcomingPaymentRepository.deleteAll();
        dailyConfigRepository.deleteAll();
        userRepository.deleteAll();

        // Register user
        var user = userService.register(RegisterRequest.builder()
                .fullName("User One")
                .email("user1@example.com")
                .password("password123")
                .build());
        userId = user.getUserId();
    }

    @Test
    void testDailyConfigCrud() {
        // Retrieve default config
        DailyReminderConfigDto config = reminderService.getDailyReminderConfig(userId);
        assertNotNull(config);
        assertFalse(config.isEnabled());
        assertEquals(21, config.getReminderTime().getHour());

        // Update config
        config.setEnabled(true);
        config.setReminderTime(LocalTime.of(19, 30));
        DailyReminderConfigDto updated = reminderService.updateDailyReminderConfig(userId, config);

        assertTrue(updated.isEnabled());
        assertEquals(19, updated.getReminderTime().getHour());
        assertEquals(30, updated.getReminderTime().getMinute());
    }

    @Test
    void testUpcomingPaymentsCrud() {
        UpcomingPaymentDto paymentDto = UpcomingPaymentDto.builder()
                .title("House Rent")
                .description("Monthly landlord transfer")
                .amount(new BigDecimal("15000.00"))
                .dueDate(LocalDate.now().plusDays(5))
                .reminderDate(LocalDate.now())
                .build();

        UpcomingPaymentDto saved = reminderService.createUpcomingPayment(userId, paymentDto);
        assertNotNull(saved.getId());
        assertFalse(saved.isCompleted());

        List<UpcomingPaymentDto> list = reminderService.getUpcomingPayments(userId);
        assertEquals(1, list.size());

        // Mark completed
        UpcomingPaymentDto completed = reminderService.markCompleted(userId, saved.getId(), true);
        assertTrue(completed.isCompleted());

        // Delete it
        reminderService.deleteUpcomingPayment(userId, saved.getId());
        assertTrue(reminderService.getUpcomingPayments(userId).isEmpty());
    }

    @Test
    void testSendUpcomingPaymentReminders() {
        UpcomingPaymentDto paymentDto = UpcomingPaymentDto.builder()
                .title("Electricity Bill")
                .amount(new BigDecimal("1200.00"))
                .dueDate(LocalDate.now().plusDays(3))
                .reminderDate(LocalDate.now()) // Set to today so it gets triggered
                .build();

        reminderService.createUpcomingPayment(userId, paymentDto);

        // This will print email contents to log
        assertDoesNotThrow(() -> reminderService.sendUpcomingPaymentReminders());
    }
}

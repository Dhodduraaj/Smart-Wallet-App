package com.expensetracker.controller;

import com.expensetracker.dto.DailyReminderConfigDto;
import com.expensetracker.dto.UpcomingPaymentDto;
import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.ReminderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/reminders")
@RequiredArgsConstructor
public class ReminderController {

    private final ReminderService reminderService;

    @GetMapping("/daily")
    public ResponseEntity<DailyReminderConfigDto> getDailyConfig(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        DailyReminderConfigDto config = reminderService.getDailyReminderConfig(userDetails.getId());
        return ResponseEntity.ok(config);
    }

    @PutMapping("/daily")
    public ResponseEntity<DailyReminderConfigDto> updateDailyConfig(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody DailyReminderConfigDto configDto) {
        DailyReminderConfigDto config = reminderService.updateDailyReminderConfig(userDetails.getId(), configDto);
        return ResponseEntity.ok(config);
    }

    @GetMapping("/upcoming")
    public ResponseEntity<List<UpcomingPaymentDto>> getUpcomingPayments(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        List<UpcomingPaymentDto> payments = reminderService.getUpcomingPayments(userDetails.getId());
        return ResponseEntity.ok(payments);
    }

    @GetMapping("/upcoming/{id}")
    public ResponseEntity<UpcomingPaymentDto> getUpcomingPayment(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id) {
        UpcomingPaymentDto payment = reminderService.getUpcomingPayment(userDetails.getId(), id);
        return ResponseEntity.ok(payment);
    }

    @PostMapping("/upcoming")
    public ResponseEntity<UpcomingPaymentDto> createUpcomingPayment(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody UpcomingPaymentDto paymentDto) {
        UpcomingPaymentDto created = reminderService.createUpcomingPayment(userDetails.getId(), paymentDto);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @PutMapping("/upcoming/{id}")
    public ResponseEntity<UpcomingPaymentDto> updateUpcomingPayment(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id,
            @Valid @RequestBody UpcomingPaymentDto paymentDto) {
        UpcomingPaymentDto updated = reminderService.updateUpcomingPayment(userDetails.getId(), id, paymentDto);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/upcoming/{id}")
    public ResponseEntity<Void> deleteUpcomingPayment(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id) {
        reminderService.deleteUpcomingPayment(userDetails.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/upcoming/{id}/completed")
    public ResponseEntity<UpcomingPaymentDto> markCompleted(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @PathVariable UUID id,
            @RequestParam boolean completed) {
        UpcomingPaymentDto updated = reminderService.markCompleted(userDetails.getId(), id, completed);
        return ResponseEntity.ok(updated);
    }
}

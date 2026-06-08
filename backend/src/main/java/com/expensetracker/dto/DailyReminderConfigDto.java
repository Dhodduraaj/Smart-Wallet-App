package com.expensetracker.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DailyReminderConfigDto {
    private boolean enabled;

    @NotNull(message = "Reminder time is required")
    private LocalTime reminderTime;

    /**
     * IANA timezone for interpreting reminder_time (e.g. Asia/Kolkata).
     */
    private String reminderZoneId;
}

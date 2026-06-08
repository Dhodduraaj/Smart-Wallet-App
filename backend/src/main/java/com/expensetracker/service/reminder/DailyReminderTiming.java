package com.expensetracker.service.reminder;

import com.expensetracker.entity.DailyReminderConfig;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * Pure time logic for daily expense reminders — recurring every calendar day at the user's wall-clock time.
 */
public final class DailyReminderTiming {

    private static final ZoneId UTC = ZoneId.of("UTC");

    private DailyReminderTiming() {
    }

    /**
     * Converts user wall-clock input to UTC local time for persistence (anchor = today in user zone).
     */
    public static LocalTime wallTimeToUtc(LocalTime wallTime, ZoneId userZone) {
        return ZonedDateTime.of(LocalDate.now(userZone), wallTime, userZone)
                .withZoneSameInstant(UTC)
                .toLocalTime();
    }

    /**
     * Converts stored UTC local time back to wall clock for the user's current calendar day.
     * Uses the user zone date (not UTC date) so ahead-of-UTC timezones stay aligned day-to-day.
     */
    public static LocalTime utcToWall(LocalTime utcTime, ZoneId userZone) {
        LocalDate userToday = LocalDate.now(userZone);
        return ZonedDateTime.of(userToday, utcTime, UTC)
                .withZoneSameInstant(userZone)
                .toLocalTime();
    }

    /**
     * True when the reminder should fire now: enabled, matching hour+minute in user zone,
     * and not already sent on this calendar day (user zone).
     */
    public static boolean isDueNow(
            DailyReminderConfig config,
            ZoneId userZone,
            ZonedDateTime nowInZone,
            LocalTime triggerWall
    ) {
        if (!config.isEnabled() || triggerWall == null) {
            return false;
        }

        if (config.getLastTriggeredAt() != null) {
            LocalDate lastTriggerDate = config.getLastTriggeredAt()
                    .atZone(UTC)
                    .withZoneSameInstant(userZone)
                    .toLocalDate();
            if (lastTriggerDate.equals(nowInZone.toLocalDate())) {
                return false;
            }
        }

        int nowMinute = nowInZone.getHour() * 60 + nowInZone.getMinute();
        int triggerMinute = triggerWall.getHour() * 60 + triggerWall.getMinute();
        return nowMinute == triggerMinute;
    }

    public static LocalDateTime nowUtc() {
        return ZonedDateTime.now(UTC).toLocalDateTime();
    }
}

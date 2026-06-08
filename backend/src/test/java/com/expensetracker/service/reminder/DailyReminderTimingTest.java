package com.expensetracker.service.reminder;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import static org.junit.jupiter.api.Assertions.*;

class DailyReminderTimingTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Test
    void utcToWallUsesUserZoneCalendarDay() {
        LocalTime wall = LocalTime.of(21, 0);
        LocalTime storedUtc = DailyReminderTiming.wallTimeToUtc(wall, IST);
        LocalTime recovered = DailyReminderTiming.utcToWall(storedUtc, IST);
        assertEquals(wall, recovered);
    }

    @Test
    void isDueNowFiresOncePerCalendarDay() {
        var config = com.expensetracker.entity.DailyReminderConfig.builder()
                .enabled(true)
                .lastTriggeredAt(null)
                .build();

        ZonedDateTime triggerMoment = ZonedDateTime.of(
                LocalDate.of(2025, 6, 8), LocalTime.of(21, 0), IST
        );
        LocalTime triggerWall = LocalTime.of(21, 0);

        assertTrue(DailyReminderTiming.isDueNow(config, IST, triggerMoment, triggerWall));

        config.setLastTriggeredAt(triggerMoment.withZoneSameInstant(ZoneId.of("UTC")).toLocalDateTime());
        assertFalse(DailyReminderTiming.isDueNow(config, IST, triggerMoment, triggerWall));

        ZonedDateTime nextDay = triggerMoment.plusDays(1);
        assertTrue(DailyReminderTiming.isDueNow(config, IST, nextDay, triggerWall));
    }

    @Test
    void isDueNowSkipsWhenDisabled() {
        var config = com.expensetracker.entity.DailyReminderConfig.builder()
                .enabled(false)
                .build();
        ZonedDateTime now = ZonedDateTime.of(LocalDate.of(2025, 6, 8), LocalTime.of(21, 0), IST);
        assertFalse(DailyReminderTiming.isDueNow(config, IST, now, LocalTime.of(21, 0)));
    }

    @Test
    void isDueNowSkipsWrongMinute() {
        var config = com.expensetracker.entity.DailyReminderConfig.builder()
                .enabled(true)
                .build();
        ZonedDateTime now = ZonedDateTime.of(LocalDate.of(2025, 6, 8), LocalTime.of(20, 59), IST);
        assertFalse(DailyReminderTiming.isDueNow(config, IST, now, LocalTime.of(21, 0)));
    }
}

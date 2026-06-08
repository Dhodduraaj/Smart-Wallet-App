package com.expensetracker.service;

import com.expensetracker.dto.DashboardSummaryDto;

import java.util.UUID;

public interface DashboardService {
    DashboardSummaryDto getDashboardSummary(UUID userId);
}

package com.expensetracker.controller;

import com.expensetracker.dto.DashboardSummaryDto;
import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/summary")
    public ResponseEntity<DashboardSummaryDto> getDashboardSummary(
            @AuthenticationPrincipal CustomUserDetails userDetails) {
        DashboardSummaryDto summary = dashboardService.getDashboardSummary(userDetails.getId());
        return ResponseEntity.ok(summary);
    }
}

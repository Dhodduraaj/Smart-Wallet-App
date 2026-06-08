package com.expensetracker.controller;

import com.expensetracker.dto.ReportDto;
import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/data")
    public ResponseEntity<ReportDto> getReportData(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        
        ReportDto reportData = reportService.getReportData(userDetails.getId(), startDate, endDate);
        return ResponseEntity.ok(reportData);
    }

    @GetMapping("/pdf")
    public ResponseEntity<byte[]> downloadPdfReport(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) String transactionType,
            @RequestParam(required = false) String category,
            @RequestParam(required = false, defaultValue = "false") Boolean omitCategory) {

        ReportDto reportData = reportService.getReportData(userDetails.getId(), startDate, endDate, transactionType, category);
        byte[] pdfBytes = reportService.generatePdfReport(reportData, omitCategory);

        String filename = String.format("financial_report_%s_to_%s.pdf", startDate, endDate);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdfBytes);
    }
}

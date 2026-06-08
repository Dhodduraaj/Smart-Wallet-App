package com.expensetracker.service;

import com.expensetracker.dto.ReportDto;

import java.time.LocalDate;
import java.util.UUID;

public interface ReportService {
    ReportDto getReportData(UUID userId, LocalDate startDate, LocalDate endDate);
    ReportDto getReportData(UUID userId, LocalDate startDate, LocalDate endDate, String transactionType, String category);
    byte[] generatePdfReport(ReportDto reportDto);
    byte[] generatePdfReport(ReportDto reportDto, Boolean omitCategory);
}

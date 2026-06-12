package com.expensetracker.service.impl;

import com.expensetracker.dto.CategorySummaryDto;
import com.expensetracker.dto.ExpenseDto;
import com.expensetracker.dto.IncomeDto;
import com.expensetracker.dto.ReportDto;
import com.expensetracker.entity.Expense;
import com.expensetracker.entity.Income;
import com.expensetracker.entity.User;
import com.expensetracker.exception.ResourceNotFoundException;
import com.expensetracker.repository.ExpenseRepository;
import com.expensetracker.repository.IncomeRepository;
import com.expensetracker.repository.UserRepository;
import com.expensetracker.service.ReportService;
import com.lowagie.text.*;
import com.lowagie.text.Font;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReportServiceImpl implements ReportService {

    private final UserRepository userRepository;
    private final ExpenseRepository expenseRepository;
    private final IncomeRepository incomeRepository;

    @Override
    @Transactional(readOnly = true)
    public ReportDto getReportData(UUID userId, LocalDate startDate, LocalDate endDate) {
        return getReportData(userId, startDate, endDate, null, null);
    }

    @Override
    @Transactional(readOnly = true)
    public ReportDto getReportData(UUID userId, LocalDate startDate, LocalDate endDate, String transactionType, String category) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        // Fetch records in range
        List<Expense> expenses = expenseRepository.findByUserIdAndExpenseDateBetween(userId, startDate, endDate);
        List<Income> incomes = incomeRepository.findByUserIdAndIncomeDateBetween(userId, startDate, endDate);

        // Apply filters
        if (transactionType != null) {
            if (transactionType.equalsIgnoreCase("income")) {
                expenses.clear();
            } else if (transactionType.equalsIgnoreCase("expense")) {
                incomes.clear();
            }
        }

        if (category != null && !category.isEmpty()) {
            expenses = expenses.stream()
                    .filter(e -> e.getCategory().equalsIgnoreCase(category))
                    .collect(Collectors.toList());
        }

        // Sort by dates
        expenses.sort(Comparator.comparing(Expense::getExpenseDate).reversed());
        incomes.sort(Comparator.comparing(Income::getIncomeDate).reversed());

        // Map to DTOs
        List<ExpenseDto> expenseDtos = expenses.stream().map(this::mapExpenseToDto).collect(Collectors.toList());
        List<IncomeDto> incomeDtos = incomes.stream().map(this::mapIncomeToDto).collect(Collectors.toList());

        // Calculations
        BigDecimal totalExpenses = expenses.stream()
                .map(Expense::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalIncome = incomes.stream()
                .map(Income::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal netSavings = totalIncome.subtract(totalExpenses);

        // Category breakdown
        Map<String, BigDecimal> categoryAmountMap = expenses.stream()
                .collect(Collectors.groupingBy(
                        Expense::getCategory,
                        Collectors.reducing(BigDecimal.ZERO, Expense::getAmount, BigDecimal::add)
                ));

        BigDecimal finalTotalExpenses = totalExpenses;
        List<CategorySummaryDto> categorySummary = categoryAmountMap.entrySet().stream()
                .map(entry -> {
                    BigDecimal amt = entry.getValue();
                    double percentage = 0.0;
                    if (finalTotalExpenses.compareTo(BigDecimal.ZERO) > 0) {
                        percentage = amt.multiply(new BigDecimal("100"))
                                .divide(finalTotalExpenses, 2, RoundingMode.HALF_UP)
                                .doubleValue();
                    }
                    return CategorySummaryDto.builder()
                            .category(entry.getKey())
                            .amount(amt)
                            .percentage(percentage)
                            .build();
                })
                .sorted(Comparator.comparing(CategorySummaryDto::getAmount).reversed())
                .collect(Collectors.toList());

        return ReportDto.builder()
                .startDate(startDate)
                .endDate(endDate)
                .fullName(user.getFullName())
                .email(user.getEmail())
                .expenses(expenseDtos)
                .incomes(incomeDtos)
                .totalExpenses(totalExpenses)
                .totalIncome(totalIncome)
                .netSavings(netSavings)
                .categorySummary(categorySummary)
                .build();
    }

    @Override
    public byte[] generatePdfReport(ReportDto reportDto) {
        return generatePdfReport(reportDto, false);
    }

    @Override
    public byte[] generatePdfReport(ReportDto reportDto, Boolean omitCategory) {
        Document document = new Document(PageSize.A4, 36, 36, 36, 36);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        try {
            PdfWriter writer = PdfWriter.getInstance(document, baos);
            
            // Fonts setup
            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18, new Color(26, 54, 93));
            Font subtitleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 14, new Color(43, 108, 176));
            Font regularFont = FontFactory.getFont(FontFactory.HELVETICA, 10, Color.BLACK);
            Font whiteHeaderFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, Color.WHITE);
            Font footerFont = FontFactory.getFont(FontFactory.HELVETICA, 9, Color.GRAY);

            writer.setPageEvent(new FooterPageEvent(footerFont));
            document.open();

            Color headerColor = new Color(43, 108, 176);

            // Title
            Paragraph title = new Paragraph("Financial Report", titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            title.setSpacingAfter(15);
            document.add(title);

            // Date Range
            Paragraph dateRange = new Paragraph("Period: " + reportDto.getStartDate() + " to " + reportDto.getEndDate(), regularFont);
            dateRange.setAlignment(Element.ALIGN_CENTER);
            dateRange.setSpacingAfter(10);
            document.add(dateRange);

            // Username
            String username = reportDto.getEmail() != null ? reportDto.getEmail() : "Unknown";
            Paragraph usernamePara = new Paragraph("Username: " + username, regularFont);
            usernamePara.setAlignment(Element.ALIGN_CENTER);
            usernamePara.setSpacingAfter(20);
            document.add(usernamePara);

            // Detailed Incomes Table (Income first)
            if (!reportDto.getIncomes().isEmpty()) {
                Paragraph sectionTitleInc = new Paragraph("Income Records", subtitleFont);
                sectionTitleInc.setSpacingAfter(10);
                document.add(sectionTitleInc);

                PdfPTable incTable = new PdfPTable(4);
                incTable.setWidthPercentage(100);
                incTable.setSpacingAfter(20);
                incTable.setWidths(new float[]{20, 40, 20, 20});

                incTable.addCell(createHeaderCell("Date", whiteHeaderFont, headerColor));
                incTable.addCell(createHeaderCell("Description", whiteHeaderFont, headerColor));
                incTable.addCell(createHeaderCell("Account", whiteHeaderFont, headerColor));
                incTable.addCell(createHeaderCell("Amount", whiteHeaderFont, headerColor));

                boolean alternate = false;
                for (IncomeDto inc : reportDto.getIncomes()) {
                    Color rowBg = alternate ? new Color(247, 250, 252) : Color.WHITE;
                    incTable.addCell(createRowCell(inc.getIncomeDate().toString(), regularFont, rowBg));
                    incTable.addCell(createRowCell(inc.getDescription(), regularFont, rowBg));
                    incTable.addCell(createRowCell(inc.getAccountName(), regularFont, rowBg));
                    incTable.addCell(createRowCell("₹" + inc.getAmount().toString(), regularFont, rowBg));
                    alternate = !alternate;
                }
                document.add(incTable);
            }

            // Detailed Expenses Table
            if (!reportDto.getExpenses().isEmpty()) {
                Paragraph sectionTitleExp = new Paragraph("Expense Records", subtitleFont);
                sectionTitleExp.setSpacingAfter(10);
                document.add(sectionTitleExp);

                PdfPTable expTable;
                if (omitCategory) {
                    expTable = new PdfPTable(3);
                    expTable.setWidthPercentage(100);
                    expTable.setSpacingAfter(20);
                    expTable.setWidths(new float[]{25, 50, 25});

                    expTable.addCell(createHeaderCell("Date", whiteHeaderFont, headerColor));
                    expTable.addCell(createHeaderCell("Description", whiteHeaderFont, headerColor));
                    expTable.addCell(createHeaderCell("Amount", whiteHeaderFont, headerColor));

                    boolean alternate = false;
                    for (ExpenseDto exp : reportDto.getExpenses()) {
                        Color rowBg = alternate ? new Color(247, 250, 252) : Color.WHITE;
                        expTable.addCell(createRowCell(exp.getExpenseDate().toString(), regularFont, rowBg));
                        expTable.addCell(createRowCell(exp.getDescription(), regularFont, rowBg));
                        expTable.addCell(createRowCell("₹" + exp.getAmount().toString(), regularFont, rowBg));
                        alternate = !alternate;
                    }
                } else {
                    expTable = new PdfPTable(4);
                    expTable.setWidthPercentage(100);
                    expTable.setSpacingAfter(20);
                    expTable.setWidths(new float[]{20, 40, 20, 20});

                    expTable.addCell(createHeaderCell("Date", whiteHeaderFont, headerColor));
                    expTable.addCell(createHeaderCell("Description", whiteHeaderFont, headerColor));
                    expTable.addCell(createHeaderCell("Category", whiteHeaderFont, headerColor));
                    expTable.addCell(createHeaderCell("Amount", whiteHeaderFont, headerColor));

                    boolean alternate = false;
                    for (ExpenseDto exp : reportDto.getExpenses()) {
                        Color rowBg = alternate ? new Color(247, 250, 252) : Color.WHITE;
                        expTable.addCell(createRowCell(exp.getExpenseDate().toString(), regularFont, rowBg));
                        expTable.addCell(createRowCell(exp.getDescription(), regularFont, rowBg));
                        expTable.addCell(createRowCell(exp.getCategory(), regularFont, rowBg));
                        expTable.addCell(createRowCell("₹" + exp.getAmount().toString(), regularFont, rowBg));
                        alternate = !alternate;
                    }
                }
                document.add(expTable);
            }

            document.close();
        } catch (Exception ex) {
            log.error("Error creating PDF report", ex);
        }

        return baos.toByteArray();
    }

    private PdfPCell createHeaderCell(String text, Font font, Color bgColor) {
        PdfPCell cell = new PdfPCell(new Paragraph(text, font));
        cell.setBackgroundColor(bgColor);
        cell.setHorizontalAlignment(Element.ALIGN_LEFT);
        cell.setPadding(6);
        return cell;
    }

    private PdfPCell createRowCell(String text, Font font, Color bgColor) {
        PdfPCell cell = new PdfPCell(new Paragraph(text != null ? text : "", font));
        cell.setBackgroundColor(bgColor);
        cell.setHorizontalAlignment(Element.ALIGN_LEFT);
        cell.setPadding(6);
        return cell;
    }

    private ExpenseDto mapExpenseToDto(Expense expense) {
        return ExpenseDto.builder()
                .id(expense.getId())
                .accountId(expense.getAccount().getId())
                .accountName(expense.getAccount().getAccountName())
                .description(expense.getDescription())
                .amount(expense.getAmount())
                .category(expense.getCategory())
                .paymentMode(expense.getPaymentMode())
                .expenseDate(expense.getExpenseDate())
                .notes(expense.getNotes())
                .createdAt(expense.getCreatedAt())
                .build();
    }

    private IncomeDto mapIncomeToDto(Income income) {
        return IncomeDto.builder()
                .id(income.getId())
                .accountId(income.getAccount().getId())
                .accountName(income.getAccount().getAccountName())
                .description(income.getDescription())
                .amount(income.getAmount())
                .incomeDate(income.getIncomeDate())
                .notes(income.getNotes())
                .createdAt(income.getCreatedAt())
                .build();
    }

    private static class FooterPageEvent extends PdfPageEventHelper {
        private final Font font;

        public FooterPageEvent(Font font) {
            this.font = font;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfPTable footerTable = new PdfPTable(1);
            footerTable.setTotalWidth(document.right() - document.left());
            footerTable.setLockedWidth(true);

            PdfPCell cell = new PdfPCell(new Paragraph("@smart-wallet", font));
            cell.setBorder(Rectangle.NO_BORDER);
            cell.setHorizontalAlignment(Element.ALIGN_CENTER);
            cell.setPadding(0);
            footerTable.addCell(cell);

            footerTable.writeSelectedRows(0, -1, document.left(), 25, writer.getDirectContent());
        }
    }
}

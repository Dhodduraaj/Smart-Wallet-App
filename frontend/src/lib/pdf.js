import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function generatePdfReportLocal(reportDto, omitCategory = false) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const margins = 36;
  const contentWidth = doc.internal.pageSize.width - margins * 2; // ~523pt

  // Define fonts & colors matching backend
  const titleColor = [26, 54, 93]; // #1a365d
  const subtitleColor = [43, 108, 176]; // #2b6cb0
  const headerColor = [43, 108, 176]; // #2b6cb0
  const alternatingRowColor = '#f7fafc';

  let currentY = margins + 20;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
  doc.text('Financial Report', doc.internal.pageSize.width / 2, currentY, { align: 'center' });
  currentY += 20;

  // Period
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Period: ${reportDto.startDate} to ${reportDto.endDate}`, doc.internal.pageSize.width / 2, currentY, { align: 'center' });
  currentY += 15;

  // Username
  const email = reportDto.email || 'Unknown';
  doc.text(`Username: ${email}`, doc.internal.pageSize.width / 2, currentY, { align: 'center' });
  currentY += 30;

  // 1. Income Records
  if (reportDto.incomes && reportDto.incomes.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(subtitleColor[0], subtitleColor[1], subtitleColor[2]);
    doc.text('Income Records', margins, currentY);
    currentY += 15;

    const incomeHeaders = [['Date', 'Description', 'Account', 'Amount']];
    const incomeRows = reportDto.incomes.map(inc => [
      inc.incomeDate ? inc.incomeDate.toString() : '',
      inc.description || '',
      inc.accountName || '',
      `₹${inc.amount}`
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: margins, right: margins },
      head: incomeHeaders,
      body: incomeRows,
      theme: 'striped',
      headStyles: {
        fillColor: headerColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'left'
      },
      bodyStyles: {
        fontSize: 10,
        textColor: [0, 0, 0]
      },
      alternateRowStyles: {
        fillColor: alternatingRowColor
      },
      styles: {
        cellPadding: 6,
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.20 },
        1: { cellWidth: contentWidth * 0.40 },
        2: { cellWidth: contentWidth * 0.20 },
        3: { cellWidth: contentWidth * 0.20 }
      },
      didDrawPage: () => {
        // Footer event helper
        drawFooter(doc, margins);
      }
    });

    currentY = doc.lastAutoTable.finalY + 25;
  }

  // 2. Expense Records
  if (reportDto.expenses && reportDto.expenses.length > 0) {
    // If table falls off the page, add a new page
    if (currentY > doc.internal.pageSize.height - 100) {
      doc.addPage();
      currentY = margins + 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(subtitleColor[0], subtitleColor[1], subtitleColor[2]);
    doc.text('Expense Records', margins, currentY);
    currentY += 15;

    let expenseHeaders, expenseRows, columnStyles;
    if (omitCategory) {
      expenseHeaders = [['Date', 'Description', 'Amount']];
      expenseRows = reportDto.expenses.map(exp => [
        exp.expenseDate ? exp.expenseDate.toString() : '',
        exp.description || '',
        `₹${exp.amount}`
      ]);
      columnStyles = {
        0: { cellWidth: contentWidth * 0.25 },
        1: { cellWidth: contentWidth * 0.50 },
        2: { cellWidth: contentWidth * 0.25 }
      };
    } else {
      expenseHeaders = [['Date', 'Description', 'Category', 'Amount']];
      expenseRows = reportDto.expenses.map(exp => [
        exp.expenseDate ? exp.expenseDate.toString() : '',
        exp.description || '',
        exp.category || '',
        `₹${exp.amount}`
      ]);
      columnStyles = {
        0: { cellWidth: contentWidth * 0.20 },
        1: { cellWidth: contentWidth * 0.40 },
        2: { cellWidth: contentWidth * 0.20 },
        3: { cellWidth: contentWidth * 0.20 }
      };
    }

    autoTable(doc, {
      startY: currentY,
      margin: { left: margins, right: margins },
      head: expenseHeaders,
      body: expenseRows,
      theme: 'striped',
      headStyles: {
        fillColor: headerColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        halign: 'left'
      },
      bodyStyles: {
        fontSize: 10,
        textColor: [0, 0, 0]
      },
      alternateRowStyles: {
        fillColor: alternatingRowColor
      },
      styles: {
        cellPadding: 6,
        overflow: 'linebreak'
      },
      columnStyles: columnStyles,
      didDrawPage: () => {
        drawFooter(doc, margins);
      }
    });
  } else {
    // If no expenses table was generated, still draw footer on current page
    drawFooter(doc, margins);
  }

  // Generate output as a Blob
  return doc.output('blob');
}

function drawFooter(doc, margins) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.height;
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(128, 128, 128);
    // Draw @smart-wallet centered at y = pageHeight - 25
    doc.text('@smart-wallet', doc.internal.pageSize.width / 2, pageHeight - 25, { align: 'center' });
  }
}

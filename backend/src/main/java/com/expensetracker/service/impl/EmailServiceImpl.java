package com.expensetracker.service.impl;

import com.expensetracker.service.EmailService;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailServiceImpl implements EmailService {

    private final JavaMailSender mailSender;

    @Override
    public void sendEmail(String to, String subject, String body) {
        log.info("📧 MOCK EMAIL LOGGER - Preparing to send plain-text email:");
        log.info("To: {}", to);
        log.info("Subject: {}", subject);
        log.info("Body:\n{}", body);
        log.info("-------------------------------------------------");
        
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            log.info("Email sent successfully via SMTP to {}", to);
        } catch (Exception ex) {
            log.warn("SMTP send failed. Logged email above for manual verification. Error: {}", ex.getMessage());
        }
    }

    @Override
    public void sendHtmlEmail(String to, String subject, String htmlBody) {
        log.info("📧 MOCK EMAIL LOGGER - Preparing to send HTML email:");
        log.info("To: {}", to);
        log.info("Subject: {}", subject);
        log.info("HTML Body:\n{}", htmlBody);
        log.info("-------------------------------------------------");

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(mimeMessage);
            log.info("HTML Email sent successfully via SMTP to {}", to);
        } catch (Exception ex) {
            log.warn("SMTP HTML send failed. Logged HTML email above for manual verification. Error: {}", ex.getMessage());
        }
    }
}

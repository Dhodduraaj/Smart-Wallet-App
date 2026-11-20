package com.expensetracker.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Component
@Slf4j
public class JwtTokenProvider {

    private final SecretKey key;
    private final long jwtExpirationInMs;
    private final long jwtRefreshExpirationInMs;

    public JwtTokenProvider(
            @Value("${app.jwt.secret:4zV7A9gK2mN5qR8uW1xY0zC3bV6n9qRvY2t5w8y/B?E(G+KbPeShVkYp3s6v9y$B}") String jwtSecret,
            @Value("${app.jwt.expiration-ms:2592000000}") long jwtExpirationInMs,
            @Value("${app.jwt.refresh-expiration-ms:2592000000}") long jwtRefreshExpirationInMs) {
        this.key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        this.jwtExpirationInMs = jwtExpirationInMs;
        this.jwtRefreshExpirationInMs = jwtRefreshExpirationInMs;
    }

    public String generateToken(UUID userId, String email, String fullName) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpirationInMs);

        return Jwts.builder()
                .subject(email)
                .claim("userId", userId.toString())
                .claim("fullName", fullName != null ? fullName : "")
                .claim("type", "ACCESS")
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(key)
                .compact();
    }

    public String generateRefreshToken(UUID userId, String email) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtRefreshExpirationInMs);

        return Jwts.builder()
                .subject(email)
                .claim("userId", userId.toString())
                .claim("type", "REFRESH")
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(key)
                .compact();
    }

    public long getExpirationInMs() {
        return jwtExpirationInMs;
    }

    public long getRefreshExpirationInMs() {
        return jwtRefreshExpirationInMs;
    }

    public String getEmailFromJWT(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        return claims.getSubject();
    }

    public UUID getUserIdFromJWT(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        String userIdStr = claims.get("userId", String.class);
        return userIdStr != null ? UUID.fromString(userIdStr) : null;
    }

    public boolean validateToken(String authToken) {
        if (authToken == null || authToken.trim().isEmpty()) {
            return false;
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(authToken)
                    .getPayload();

            // Refresh tokens cannot be used directly as access tokens
            String type = claims.get("type", String.class);
            if ("REFRESH".equals(type)) {
                log.warn("Rejected refresh token presented as access token");
                return false;
            }
            return true;
        } catch (MalformedJwtException ex) {
            log.warn("Invalid JWT token: {}", ex.getMessage());
        } catch (ExpiredJwtException ex) {
            log.warn("Expired JWT token: {}", ex.getMessage());
        } catch (UnsupportedJwtException ex) {
            log.warn("Unsupported JWT token: {}", ex.getMessage());
        } catch (IllegalArgumentException ex) {
            log.warn("JWT claims string is empty: {}", ex.getMessage());
        } catch (Exception ex) {
            log.warn("Unexpected JWT validation error: {}", ex.getMessage());
        }
        return false;
    }

    public boolean validateRefreshToken(String token) {
        if (token == null || token.trim().isEmpty()) {
            return false;
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            String type = claims.get("type", String.class);
            return "REFRESH".equals(type);
        } catch (MalformedJwtException ex) {
            log.warn("Invalid refresh token: {}", ex.getMessage());
        } catch (ExpiredJwtException ex) {
            log.warn("Expired refresh token: {}", ex.getMessage());
        } catch (UnsupportedJwtException ex) {
            log.warn("Unsupported refresh token: {}", ex.getMessage());
        } catch (IllegalArgumentException ex) {
            log.warn("Refresh token claims string is empty: {}", ex.getMessage());
        } catch (Exception ex) {
            log.warn("Unexpected refresh token validation error: {}", ex.getMessage());
        }
        return false;
    }
}

package com.expensetracker.controller;

import com.expensetracker.dto.ChangePasswordRequest;
import com.expensetracker.dto.UpdateAvatarRequest;
import com.expensetracker.dto.UserDto;
import com.expensetracker.security.CustomUserDetails;
import com.expensetracker.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody ChangePasswordRequest request) {
        userService.changePassword(userDetails.getId(), request);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/profile-avatar")
    public ResponseEntity<UserDto> updateAvatar(
            @AuthenticationPrincipal CustomUserDetails userDetails,
            @Valid @RequestBody UpdateAvatarRequest request) {
        UserDto updatedUser = userService.updateAvatar(userDetails.getId(), request.getAvatar());
        return ResponseEntity.ok(updatedUser);
    }
}

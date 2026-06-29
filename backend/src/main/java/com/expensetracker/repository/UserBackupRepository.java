package com.expensetracker.repository;

import com.expensetracker.entity.UserBackup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface UserBackupRepository extends JpaRepository<UserBackup, UUID> {
}

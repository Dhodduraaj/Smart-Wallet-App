-- V004: Reconcile duplicate Cash accounts, recalculate canonical balances, and enforce unique default Cash account per user

DO $$
DECLARE
    user_rec RECORD;
    canonical_id UUID;
    dup_rec RECORD;
    dup_expenses NUMERIC(15, 2);
    dup_incomes NUMERIC(15, 2);
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounts') THEN
        
        -- Loop over distinct users who have Cash accounts
        FOR user_rec IN 
            SELECT DISTINCT user_id 
            FROM accounts 
            WHERE LOWER(account_name) = 'cash' OR account_type = 'SYSTEM'
        LOOP
            -- Find canonical Cash account for this user:
            -- 1. Account with the most linked transactions (expenses + incomes)
            -- 2. Account with non-zero balance
            -- 3. Oldest created_at
            SELECT a.id INTO canonical_id
            FROM accounts a
            WHERE a.user_id = user_rec.user_id
              AND (LOWER(a.account_name) = 'cash' OR a.account_type = 'SYSTEM')
            ORDER BY 
              (COALESCE((SELECT COUNT(*) FROM expenses e WHERE e.account_id = a.id), 0) +
               COALESCE((SELECT COUNT(*) FROM incomes i WHERE i.account_id = a.id), 0)) DESC,
              ABS(COALESCE(a.current_balance, 0)) DESC,
              a.created_at ASC
            LIMIT 1;

            IF canonical_id IS NOT NULL THEN
                -- Find all duplicate Cash accounts for this user
                FOR dup_rec IN
                    SELECT id, current_balance
                    FROM accounts
                    WHERE user_id = user_rec.user_id
                      AND (LOWER(account_name) = 'cash' OR account_type = 'SYSTEM')
                      AND id <> canonical_id
                LOOP
                    -- Calculate expenses and incomes tied to duplicate
                    SELECT COALESCE(SUM(amount), 0) INTO dup_expenses FROM expenses WHERE account_id = dup_rec.id;
                    SELECT COALESCE(SUM(amount), 0) INTO dup_incomes FROM incomes WHERE account_id = dup_rec.id;

                    -- Reassociate expenses and incomes to canonical Cash account
                    UPDATE expenses SET account_id = canonical_id WHERE account_id = dup_rec.id;
                    UPDATE incomes SET account_id = canonical_id WHERE account_id = dup_rec.id;

                    -- Adjust canonical balance if duplicate had transactions that were not reflected on canonical
                    IF dup_expenses > 0 OR dup_incomes > 0 THEN
                        UPDATE accounts 
                        SET current_balance = current_balance + dup_incomes - dup_expenses
                        WHERE id = canonical_id;
                    ELSIF dup_rec.current_balance <> 0 AND (SELECT current_balance FROM accounts WHERE id = canonical_id) = 0 THEN
                        -- If canonical had 0 balance but duplicate had the original balance, adopt it safely
                        UPDATE accounts 
                        SET current_balance = dup_rec.current_balance 
                        WHERE id = canonical_id;
                    END IF;

                    -- Delete duplicate account row
                    DELETE FROM accounts WHERE id = dup_rec.id;
                END LOOP;

                -- Ensure canonical Cash account has standard properties
                UPDATE accounts 
                SET account_name = 'Cash', account_type = 'SYSTEM' 
                WHERE id = canonical_id;
            END IF;
        END LOOP;

        -- Create partial unique index to guarantee at most ONE default Cash account per user
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_default_cash 
        ON accounts (user_id) 
        WHERE account_type = 'SYSTEM' OR LOWER(account_name) = 'cash';

    END IF;
END $$;

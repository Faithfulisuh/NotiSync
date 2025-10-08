package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/notisync/backend/internal/types"
)

type UserRuleRepository struct {
	db *sql.DB
}

func NewUserRuleRepository(db *sql.DB) *UserRuleRepository {
	return &UserRuleRepository{db: db}
}

func (r *UserRuleRepository) Create(rule *types.UserRule) error {
	query := `
		INSERT INTO user_rules (id, user_id, rule_name, rule_type, conditions, actions, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	
	rule.ID = uuid.New()
	rule.CreatedAt = time.Now()

	conditionsJSON, err := json.Marshal(rule.Conditions)
	if err != nil {
		return fmt.Errorf("failed to marshal conditions: %w", err)
	}

	actionsJSON, err := json.Marshal(rule.Actions)
	if err != nil {
		return fmt.Errorf("failed to marshal actions: %w", err)
	}

	_, err = r.db.Exec(query,
		rule.ID, rule.UserID, rule.RuleName, rule.RuleType,
		conditionsJSON, actionsJSON, rule.IsActive, rule.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create user rule: %w", err)
	}

	return nil
}

func (r *UserRuleRepository) GetByID(id uuid.UUID) (*types.UserRule, error) {
	query := `
		SELECT id, user_id, rule_name, rule_type, conditions, actions, is_active, created_at
		FROM user_rules
		WHERE id = $1
	`

	rule := &types.UserRule{}
	var conditionsJSON, actionsJSON []byte

	err := r.db.QueryRow(query, id).Scan(
		&rule.ID, &rule.UserID, &rule.RuleName, &rule.RuleType,
		&conditionsJSON, &actionsJSON, &rule.IsActive, &rule.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user rule not found")
		}
		return nil, fmt.Errorf("failed to get user rule by ID: %w", err)
	}

	if err := json.Unmarshal(conditionsJSON, &rule.Conditions); err != nil {
		return nil, fmt.Errorf("failed to unmarshal conditions: %w", err)
	}

	if err := json.Unmarshal(actionsJSON, &rule.Actions); err != nil {
		return nil, fmt.Errorf("failed to unmarshal actions: %w", err)
	}

	return rule, nil
}

func (r *UserRuleRepository) GetByUserID(userID uuid.UUID) ([]*types.UserRule, error) {
	query := `
		SELECT id, user_id, rule_name, rule_type, conditions, actions, is_active, created_at
		FROM user_rules
		WHERE user_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user rules by user ID: %w", err)
	}
	defer rows.Close()

	var rules []*types.UserRule
	for rows.Next() {
		rule := &types.UserRule{}
		var conditionsJSON, actionsJSON []byte

		err := rows.Scan(
			&rule.ID, &rule.UserID, &rule.RuleName, &rule.RuleType,
			&conditionsJSON, &actionsJSON, &rule.IsActive, &rule.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan user rule: %w", err)
		}

		if err := json.Unmarshal(conditionsJSON, &rule.Conditions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal conditions: %w", err)
		}

		if err := json.Unmarshal(actionsJSON, &rule.Actions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal actions: %w", err)
		}

		rules = append(rules, rule)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating user rules: %w", err)
	}

	return rules, nil
}

func (r *UserRuleRepository) GetActiveByUserID(userID uuid.UUID) ([]*types.UserRule, error) {
	query := `
		SELECT id, user_id, rule_name, rule_type, conditions, actions, is_active, created_at
		FROM user_rules
		WHERE user_id = $1 AND is_active = true
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get active user rules: %w", err)
	}
	defer rows.Close()

	var rules []*types.UserRule
	for rows.Next() {
		rule := &types.UserRule{}
		var conditionsJSON, actionsJSON []byte

		err := rows.Scan(
			&rule.ID, &rule.UserID, &rule.RuleName, &rule.RuleType,
			&conditionsJSON, &actionsJSON, &rule.IsActive, &rule.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan user rule: %w", err)
		}

		if err := json.Unmarshal(conditionsJSON, &rule.Conditions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal conditions: %w", err)
		}

		if err := json.Unmarshal(actionsJSON, &rule.Actions); err != nil {
			return nil, fmt.Errorf("failed to unmarshal actions: %w", err)
		}

		rules = append(rules, rule)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating active user rules: %w", err)
	}

	return rules, nil
}

func (r *UserRuleRepository) Update(rule *types.UserRule) error {
	query := `
		UPDATE user_rules
		SET rule_name = $2, rule_type = $3, conditions = $4, actions = $5, is_active = $6
		WHERE id = $1
	`

	conditionsJSON, err := json.Marshal(rule.Conditions)
	if err != nil {
		return fmt.Errorf("failed to marshal conditions: %w", err)
	}

	actionsJSON, err := json.Marshal(rule.Actions)
	if err != nil {
		return fmt.Errorf("failed to marshal actions: %w", err)
	}

	result, err := r.db.Exec(query,
		rule.ID, rule.RuleName, rule.RuleType,
		conditionsJSON, actionsJSON, rule.IsActive,
	)
	if err != nil {
		return fmt.Errorf("failed to update user rule: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("user rule not found")
	}

	return nil
}

func (r *UserRuleRepository) Delete(id uuid.UUID) error {
	query := `DELETE FROM user_rules WHERE id = $1`

	result, err := r.db.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete user rule: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("user rule not found")
	}

	return nil
}
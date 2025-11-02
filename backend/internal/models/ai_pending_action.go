package models

import (
    "time"
    "github.com/lib/pq"
)

// AIPendingAction represents an AI-suggested action awaiting admin review
type AIPendingAction struct {
    ID           string         `json:"id" gorm:"primaryKey;column:id;type:varchar(255);default:gen_random_uuid()"`
    BatchID      *string        `json:"batch_id" gorm:"column:batch_id;type:varchar(255)"`
    Source       string         `json:"source" gorm:"column:source;type:varchar(50);not null"` // telegram_text | telegram_image
    RawInput     string         `json:"raw_input" gorm:"column:raw_input;type:text;not null"`
    ToonText     *string        `json:"toon_text" gorm:"column:toon_text;type:text"`
    ActionJSON   []byte         `json:"action_json" gorm:"column:action_json;type:jsonb"`
    Confidence   *float64       `json:"confidence" gorm:"column:confidence;type:decimal(10,5)"`
    Status       string         `json:"status" gorm:"column:status;type:varchar(20);not null;default:'pending'"` // pending|accepted|rejected
    Error        *string        `json:"error" gorm:"column:error;type:text"`
    CreatedTxIDs pq.StringArray `json:"created_tx_ids" gorm:"column:created_tx_ids;type:text[]"`
    Meta         []byte         `json:"meta" gorm:"column:meta;type:jsonb"`
    CreatedAt    time.Time      `json:"created_at" gorm:"column:created_at;type:timestamptz;autoCreateTime"`
    UpdatedAt    time.Time      `json:"updated_at" gorm:"column:updated_at;type:timestamptz;autoUpdateTime"`
}

func (AIPendingAction) TableName() string { return "ai_pending_actions" }



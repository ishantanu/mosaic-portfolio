package domain

import "time"

type Portfolio struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Broker    string `json:"broker"`
	AccountID string `json:"accountId"`

	Holdings []Holding `json:"holdings"`

	LastSynced time.Time `json:"lastSynced"`
}

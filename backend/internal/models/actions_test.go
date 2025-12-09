package models

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func TestStakeParams_ValidateAndMapping(t *testing.T) {
	sp := StakeParams{
		Date:              time.Now(),
		SourceAccount:     "Bank",
		InvestmentAccount: "Vault",
		Asset:             "USDT",
		Amount:            100,
		Horizon:           "long-term",
		Counterparty:      "Alice",
		Tag:               "invest",
		Note:              "test",
	}
	if err := sp.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	in := sp.ToIncomingTransaction()
	if in.Type != ActionStake || in.Account != "Vault" || in.Asset != "USDT" {
		t.Fatalf("unexpected incoming tx: %+v", in)
	}
	if in.LocalCurrency != "USD" || !in.FeeLocal.Equal(decimal.Zero) {
		t.Fatalf("unexpected incoming currency/fee: %s %s", in.LocalCurrency, in.FeeLocal)
	}
	if in.Horizon == nil || *in.Horizon != "long-term" {
		t.Fatalf("expected horizon to be set")
	}

	out := sp.ToOutgoingTransaction()
	if out.Type != "transfer_out" || out.Account != "Bank" || out.Asset != "USDT" {
		t.Fatalf("unexpected outgoing tx: %+v", out)
	}
	if out.LocalCurrency != "USD" {
		t.Fatalf("expected USD local currency")
	}
}

func TestStakeParams_ValidateErrors(t *testing.T) {
	cases := []StakeParams{
		{},
		{Date: time.Now()},
		{Date: time.Now(), SourceAccount: "s"},
		{Date: time.Now(), SourceAccount: "s", InvestmentAccount: "i"},
		{Date: time.Now(), SourceAccount: "s", InvestmentAccount: "i", Asset: "a"},
	}
	for _, c := range cases {
		if err := c.Validate(); err == nil {
			t.Fatalf("expected validation error for %#v", c)
		}
	}
}

func TestUnstakeParams_Validate(t *testing.T) {
	now := time.Now()
	// Missing required fields
	if err := (UnstakeParams{}).Validate(); err == nil {
		t.Fatal("expected error for missing fields")
	}
	// Quantity without price
	u := UnstakeParams{Date: now, InvestmentAccount: "inv", DestinationAccount: "dest", Asset: "BTC", Quantity: 1}
	if err := u.Validate(); err == nil {
		t.Fatal("expected error when quantity provided without price")
	}
	// Valid with amount only
	u = UnstakeParams{Date: now, InvestmentAccount: "inv", DestinationAccount: "dest", Asset: "BTC", Amount: 100}
	if err := u.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Valid with quantity + exit price usd
	u = UnstakeParams{Date: now, InvestmentAccount: "inv", DestinationAccount: "dest", Asset: "BTC", Quantity: 2, ExitPriceUSD: 30000}
	if err := u.Validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

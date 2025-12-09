package errors

import "testing"

func TestErrValidationError(t *testing.T) {
	err := &ErrValidation{Field: "amount", Message: "must be positive"}
	if got, want := err.Error(), "amount: must be positive"; got != want {
		t.Fatalf("unexpected error string: got %q want %q", got, want)
	}
}

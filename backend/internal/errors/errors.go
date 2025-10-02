package errors

type ErrValidation struct {
	Field   string
	Message string
}

func (e *ErrValidation) Error() string {
	return e.Field + ": " + e.Message
}

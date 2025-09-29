package logger

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// New creates a zap logger configured based on environment variables.
// If APP_ENV or LOG_ENV is set to "production", a production logger is returned; otherwise a development logger.
func New() (*zap.Logger, error) {
	env := os.Getenv("LOG_ENV")
	if env == "" {
		env = os.Getenv("APP_ENV")
	}

	if env == "production" {
		cfg := zap.NewProductionConfig()
		// Include caller and stacktrace on error in production
		cfg.EncoderConfig.TimeKey = "ts"
		cfg.Level = zap.NewAtomicLevelAt(zapcore.InfoLevel)
		return cfg.Build(zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))
	}

	cfg := zap.NewDevelopmentConfig()
	cfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	cfg.Level = zap.NewAtomicLevelAt(zapcore.DebugLevel)
	return cfg.Build(zap.AddCaller())
}

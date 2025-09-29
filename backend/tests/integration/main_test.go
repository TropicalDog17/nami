package integration

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

// TestMain spins up a single container for the integration package and tears it down once.
func TestMain(m *testing.M) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	container, err := setupWithContext(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to start test container: %v\n", err)
		os.Exit(1)
	}
	suiteContainer = container

	code := m.Run()

	if suiteContainer != nil {
		if suiteContainer.DB != nil {
			_ = suiteContainer.DB.Close()
		}
		if suiteContainer.Container != nil {
			_ = suiteContainer.Container.Terminate(context.Background())
		}
	}
	os.Exit(code)
}

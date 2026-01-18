package store

import (
	"context"
)

// MockPricing implements pricing.Provider for testing
type MockPricing struct{}

func (m *MockPricing) GetNodePrice(ctx context.Context, region, instanceType string) (float64, error) {
	// Return dummy price of $1.00/hr
	return 1.0, nil
}

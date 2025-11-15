package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"time"
)

// Client talks to ClusterCost agents over HTTP.
type Client struct {
	httpClient *http.Client
}

// NewClient builds a client with a configurable timeout.
func NewClient(timeout time.Duration) *Client {
	if timeout == 0 {
		timeout = 10 * time.Second
	}
	return &Client{httpClient: &http.Client{Timeout: timeout}}
}

func (c *Client) FetchHealth(ctx context.Context, baseURL string) (HealthResponse, error) {
	var resp HealthResponse
	if err := c.get(ctx, baseURL, "/api/health", &resp); err != nil {
		return HealthResponse{}, err
	}
	return resp, nil
}

func (c *Client) FetchSummary(ctx context.Context, baseURL string) (SummaryResponse, error) {
	var resp SummaryResponse
	if err := c.get(ctx, baseURL, "/api/cost/summary", &resp); err != nil {
		return SummaryResponse{}, err
	}
	return resp, nil
}

func (c *Client) FetchNamespaces(ctx context.Context, baseURL string) ([]NamespaceCost, error) {
	var resp []NamespaceCost
	if err := c.get(ctx, baseURL, "/api/cost/namespaces", &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (c *Client) FetchNodes(ctx context.Context, baseURL string) ([]NodeCost, error) {
	var resp []NodeCost
	if err := c.get(ctx, baseURL, "/api/cost/nodes", &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (c *Client) FetchWorkloads(ctx context.Context, baseURL string) ([]WorkloadCost, error) {
	var resp []WorkloadCost
	if err := c.get(ctx, baseURL, "/api/cost/workloads", &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (c *Client) FetchPods(ctx context.Context, baseURL string) ([]PodCost, error) {
	var resp []PodCost
	if err := c.get(ctx, baseURL, "/api/cost/pods", &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (c *Client) get(ctx context.Context, baseURL, endpoint string, target any) error {
	u, err := url.Parse(baseURL)
	if err != nil {
		return fmt.Errorf("invalid agent URL %s: %w", baseURL, err)
	}
	u.Path = path.Join(u.Path, endpoint)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	res, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("call agent: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("agent responded with status %d", res.StatusCode)
	}

	dec := json.NewDecoder(res.Body)
	if err := dec.Decode(target); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	return nil
}

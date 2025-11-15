.PHONY: backend frontend build docker test clean

BACKEND_ENV ?= LISTEN_ADDR=:9090
AGENT_URLS ?=

backend:
	$(BACKEND_ENV) AGENT_URLS=$(AGENT_URLS) go run ./cmd/dashboard

frontend:
	cd web && npm install && npm run dev

build:
	cd web && npm install && npm run build
	GOMODCACHE=$(PWD)/.gocache GOCACHE=$(PWD)/.gocache/go go build ./cmd/dashboard

docker:
	docker build -f deployments/docker/Dockerfile -t clustercost/dashboard .

test:
	GOMODCACHE=$(PWD)/.gocache GOCACHE=$(PWD)/.gocache/go go test ./...

clean:
	rm -rf .gocache web/node_modules web/dist
	rm -rf internal/static/dist/*
	touch internal/static/dist/.gitkeep

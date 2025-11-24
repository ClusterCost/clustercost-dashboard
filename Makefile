.PHONY: backend frontend build docker test clean dev-backend dev-frontend dev-bundle

BACKEND_ENV ?= LISTEN_ADDR=:9010
AGENT_URLS ?=
BIN_DIR ?= $(PWD)/bin
BINARY ?= $(BIN_DIR)/clustercost

dev-backend:
	$(BACKEND_ENV) AGENT_URLS=$(AGENT_URLS) go run ./cmd/dashboard

backend: dev-backend

dev-frontend:
	cd web && npm install && npm run dev

frontend: dev-frontend

build:
	cd web && npm install && npm run build
	mkdir -p $(BIN_DIR)
	GOMODCACHE=$(PWD)/.gocache GOCACHE=$(PWD)/.gocache/go go build -o $(BINARY) ./cmd/dashboard

dev-bundle: build
	$(BACKEND_ENV) AGENT_URLS=$(AGENT_URLS) $(BINARY)

docker:
	docker build -f deployments/docker/Dockerfile -t clustercost/dashboard .

test:
	GOMODCACHE=$(PWD)/.gocache GOCACHE=$(PWD)/.gocache/go go test ./...

clean:
	rm -rf .gocache web/node_modules web/dist $(BIN_DIR)
	rm -rf internal/static/dist/*
	touch internal/static/dist/.gitkeep

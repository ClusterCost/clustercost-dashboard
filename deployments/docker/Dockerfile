# syntax=docker/dockerfile:1

FROM node:20-alpine AS frontend
WORKDIR /app
RUN mkdir -p internal/static
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install --legacy-peer-deps || npm install
COPY web/ ./
RUN npm run build

FROM golang:1.21 AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . ./
COPY --from=frontend /app/internal/static/dist ./internal/static/dist
RUN --mount=type=cache,target=/root/.cache/go-build CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/clustercost ./cmd/dashboard

FROM gcr.io/distroless/base-debian12
COPY --from=backend /out/clustercost /usr/bin/clustercost
EXPOSE 8080
ENV LISTEN_ADDR=:9090
ENTRYPOINT ["/usr/bin/clustercost"]

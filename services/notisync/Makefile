.PHONY: build run test clean docker-build docker-run

# Go commands
build:
	go build -o bin/notisync ./cmd/api

run:
	go run ./cmd/api

test:
	go test ./...

clean:
	rm -rf bin/

# Docker commands
docker-build:
	docker build -t notisync-api .

docker-run:
	docker-compose up -d

docker-stop:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Database commands
db-migrate-up:
	docker-compose exec postgres psql -U notisync -d notisync -f /docker-entrypoint-initdb.d/001_initial_schema.up.sql

db-migrate-down:
	docker-compose exec postgres psql -U notisync -d notisync -f /docker-entrypoint-initdb.d/001_initial_schema.down.sql

# Development commands
dev:
	docker-compose up -d postgres redis
	go run ./cmd/api

deps:
	go mod tidy
	go mod download
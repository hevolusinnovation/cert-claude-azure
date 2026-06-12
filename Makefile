# CCA Exam Simulator — common tasks
# Run `make help` to list available targets.

IMAGE      ?= cca-exam-simulator:latest
CONTAINER  ?= cca-exam-simulator
PORT       ?= 3000

.DEFAULT_GOAL := help

.PHONY: help install dev build start lint test \
        docker-build docker-run docker-stop docker-logs \
        up down logs db db-shell db-reset clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## --- Local (Node) ---

install: ## Install npm dependencies
	npm install

dev: ## Start the dev server (http://localhost:3000)
	npm run dev

build: ## Production build
	npm run build

start: ## Run the production build
	npm start

lint: ## Lint the codebase
	npm run lint

test: ## Run the unit tests
	npm test

## --- Docker (raw) ---

docker-build: ## Build the production Docker image
	docker build -t $(IMAGE) .

docker-run: ## Run the image (reads .env.local for ANTHROPIC_API_KEY)
	docker run --rm -p $(PORT):3000 --env-file .env.local --name $(CONTAINER) $(IMAGE)

docker-stop: ## Stop the running container
	-docker stop $(CONTAINER)

docker-logs: ## Tail logs from the running container
	docker logs -f $(CONTAINER)

## --- Docker Compose ---

up: ## Build and start via docker compose (detached)
	docker compose up --build -d

down: ## Stop and remove compose services
	docker compose down

logs: ## Tail compose logs
	docker compose logs -f

## --- Database ---

db: ## Start only the Postgres service (for `make dev`)
	docker compose up -d db

db-shell: ## Open a psql shell in the Postgres container
	docker exec -it cca-exam-db psql -U cca -d cca

db-reset: ## Drop the Postgres data volume (destroys all users/sessions)
	docker compose down -v

## --- Housekeeping ---

clean: ## Remove build artifacts
	rm -rf .next node_modules/.cache

# Makefile for oncai-review — local dev, build, and run.
# Requires: uv (https://docs.astral.sh/uv/). JS tooling (Node + npm) is needed
# for `make test-js`, `make lint`, and `make format` — run `make install` first.

# PyInstaller's --add-data separator differs by OS: ';' on Windows, ':' elsewhere.
ifeq ($(OS),Windows_NT)
  DATA_SEP := ;
  BINARY := dist/oncai-review.exe
else
  DATA_SEP := :
  BINARY := dist/oncai-review
endif

# By default no port is forced, so the server uses its default and auto-falls
# back to an open one if it's taken. Pin it with: make start PORT=9000
PORT ?=
PORT_ARG := $(if $(PORT),--port $(PORT))

.DEFAULT_GOAL := help
.PHONY: help install start demo build test test-js lint format check clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install dev tooling (uv dev group + npm dev deps)
	uv sync --group dev
	npm install

start: ## Run the review server (optional: PORT=9000)
	python server.py $(PORT_ARG)

demo: ## Run the server with the bundled synthetic demo package
	python server.py --package examples/demo.review_pkg.json $(PORT_ARG)

build: ## Build a single-file executable into dist/ (PyInstaller)
	uvx pyinstaller --onefile --name oncai-review \
		--add-data "web$(DATA_SEP)web" \
		--add-data "pyproject.toml$(DATA_SEP)." server.py
	@echo "Built $(BINARY)"

lint: ## Lint & type-check everything (ruff, ty, eslint, prettier --check)
	uvx ruff check .
	uv run --group dev ty check .
	npx eslint .
	npx prettier --check .

format: ## Auto-format & auto-fix (ruff, prettier, eslint --fix)
	uvx ruff format .
	npx prettier --write .
	npx eslint . --fix

test: ## Run the Python test suite
	uv run --group dev pytest -q

test-js: ## Run the front-end test suite (Node's built-in runner)
	node --test "web/*.test.js"

check: lint test test-js ## Run everything: lint + all tests

clean: ## Remove build artifacts (dist/, build/, *.spec)
	rm -rf build dist *.spec

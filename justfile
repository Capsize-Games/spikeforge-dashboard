set shell := ["bash", "-euo", "pipefail", "-c"]

default: ci

setup:
    npm ci

build:
    npm run build

test:
    npm run scripts:test
    npm run desktop:test

run:
    npm run dev

clean:
    rm -rf dist release

docs:
    @echo "See README.md and AGENTS.md for the dashboard and test contract."

ci: setup build test

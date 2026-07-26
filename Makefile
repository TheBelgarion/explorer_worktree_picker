SHELL := /bin/bash
NPM ?= npm
GIT ?= git

.PHONY: all install build test typecheck lint package ci clean release release-patch release-minor release-major tag-release help

all: build test package

help:
	@echo "Explorer Worktree Picker - Make targets:"
	@echo "  make install   Install dependencies"
	@echo "  make build     Compile extension (npm run build)"
	@echo "  make test      Run unit tests"
	@echo "  make lint      Run ESLint"
	@echo "  make typecheck Run TypeScript checks"
	@echo "  make package   Build and package .vsix"
	@echo "  make ci        install → build → test → package"
	@echo "  make release   Full release (requires clean git state): bump + all + commit + tag"
	@echo "  make release-patch|minor|major   Release with semantic version bump"
	@echo "  make tag-release VERSION=<x.y.z>  Commit versioned package files and create vVERSION tag"
	@echo "  make clean     Remove build artifacts and node_modules"

install:
	$(NPM) install

build:
	$(NPM) run build

test: lint typecheck
	$(NPM) test
	$(NPM) audit --omit=dev

typecheck:
	$(NPM) run typecheck

lint:
	$(NPM) run lint

package:
	$(NPM) run package

ci: install all

clean:
	rm -rf node_modules out *.vsix

release: release-patch

release-patch:
	@$(MAKE) _release-bump BUMP=patch

release-minor:
	@$(MAKE) _release-bump BUMP=minor

release-major:
	@$(MAKE) _release-bump BUMP=major

tag-release:
	@if [ -z "$(VERSION)" ]; then \
		echo "VERSION is required. Example: make tag-release VERSION=0.1.1"; \
		exit 1; \
	fi
	@if ! echo "$(VERSION)" | grep -Eq '^[0-9]+\\.[0-9]+\\.[0-9]+$$'; then \
		echo "VERSION must be semver x.y.z"; \
		exit 1; \
	fi
	@if ! $(GIT) diff --quiet -- package-lock.json package.json; then \
		$(GIT) add package.json package-lock.json; \
		$(GIT) commit -m "chore: release v$(VERSION)"; \
	else \
		echo "No version file changes to commit."; \
	fi
	$(GIT) tag -a v$(VERSION) -m "Release v$(VERSION)"

_release-bump:
	@CURRENT_BRANCH=$$($(GIT) rev-parse --abbrev-ref HEAD); \
	if [ "$$CURRENT_BRANCH" = "HEAD" ]; then \
		echo "Release requires a checked-out branch (not detached HEAD)." ; \
		exit 1; \
	fi
	@if ! $(GIT) diff --quiet --; then \
		echo "Working tree is dirty. Please commit or stash changes first." ; \
		exit 1; \
	fi
	@if [ ! -f scripts/bump-version.mjs ]; then \
		echo "Missing scripts/bump-version.mjs"; \
		exit 1; \
	fi
	@if [ -z "$(BUMP)" ]; then \
		echo "Usage: make _release-bump BUMP=<patch|minor|major>"; \
		exit 1; \
	fi
	node scripts/bump-version.mjs $(BUMP)
	$(MAKE) ci
	VERSION=$$(node -p "require('./package.json').version"); \
	$(GIT) add package.json package-lock.json; \
	$(GIT) commit -m "chore: release v$$VERSION"; \
	$(GIT) tag -a "v$$VERSION" -m "Release v$$VERSION"; \
	echo "Release v$$VERSION created. Push with: git push --follow-tags"

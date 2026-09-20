.PHONY: dev fake download mola test

dev:
	./scripts/dev.sh

fake:
	./scripts/fake-grid.sh

download:
	./scripts/download-dem.sh

mola:
	./scripts/mola-grid.sh

test:
	./scripts/test.sh

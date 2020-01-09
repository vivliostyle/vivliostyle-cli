default: test

build:
	docker build -t vivliostyle/cli .

test: build
	docker run --rm -it -e DEBUG=vivliostyle-cli vivliostyle/cli build tests/fixtures/wood --no-sandbox -b -s A4 -o test.pdf

run: build
	docker run --rm -it --entrypoint bash vivliostyle/cli

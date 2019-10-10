test:
	docker build -t vivliostyle/savepdf .
	docker run --rm -it vivliostyle/savepdf --version

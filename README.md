# Vivliostyle CLI

Save the pdf file via Headless Chrome and Vivliostyle.

## Install

```
npm install -g @vivliostyle/cli
```

## Usage

```
Usage: vivliostyle [options] [command]

Options:
  -v, --version    output the version number
  -h, --help       output usage information

Commands:
  build <input>    Launch headless Chrome and build PDF file
  preview <input>  Open preview page
  help [cmd]       display help for [cmd]
```

### `build` command

> Launch headless Chrome and save PDF file

```
Usage: vivliostyle build [options] <input>

Launch headless Chrome and save PDF file

Options:
  -b, --book                    load document as book mode
                               It can load multi-HTML documents such as an unzipped EPUB and a Web Publication.
                               Please see also http://vivliostyle.github.io/vivliostyle.js/docs/en/
  --no-sandbox                  launch chrome without sandbox (use this option to avoid ECONNREFUSED error)
  -r, --root <root_directory>   specify assets root path (default directory of input file)
  -o, --output <output_file>    specify output file path (default output.pdf) (default: "output.pdf")
  -s, --size <size>             output pdf size (ex: 'A4' 'JIS-B5' '182mm,257mm' '8.5in,11in')
  -t, --timeout <time>          timeout times for waiting Vivliostyle process (default: 60s)
  --press-ready                 make generated PDF compatible with press ready PDF/X-1a
  --executable-chromium <path>  specify a path of executable Chrome(Chromium) you installed
  --verbose                     verbose log output
  -h, --help                    output usage information
```

### `preview` command

> Open preview page and save PDF interactively

```
Usage: vivliostyle preview [options] <input>

Open preview page and save PDF interactively

Options:
  -b, --book                    load document as book mode
                               It can load multi-HTML documents such as an unzipped EPUB and a Web Publication.
                               Please see also http://vivliostyle.github.io/vivliostyle.js/docs/en/
  --no-sandbox                  launch chrome without sandbox (use this option to avoid ECONNREFUSED error)
  -r, --root <root_directory>   specify assets root path (default directory of input file)
  --executable-chromium <path>  specify a path of executable Chrome(Chromium) you installed
  -h, --help                    output usage information
```

## Contribute

### Build

```
yarn install
yarn build
yarn link
vivliostyle --version
```

### Docker Build

```
docker build -t vivliostyle/cli .
```

## License

Licensed under [AGPL Version 3](http://www.gnu.org/licenses/agpl.html).

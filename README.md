![Vivliostyle CLI](https://raw.githubusercontent.com/vivliostyle/vivliostyle-cli/master/assets/cover.jpg)

> Supercharge your command-line publication workflow.

## Install

```
npm install -g @vivliostyle/cli
```

## Use

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

### `init`

> generate `vivliostyle.config.js`.

```
vivliostyle init
```

### `build`

> build and create PDF file.

Place [vivliostyle.config.js](https://github.com/vivliostyle/vivliostyle-cli/issues/38) in the root directory, then:

```
vivliostyle build
```

#### CLI options

```
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

### `preview`

> Open preview page and save PDF interactively

```
vivliostyle preview
```

#### CLI options

```
Options:
  -b, --book                    load document as book mode
                               It can load multi-HTML documents such as an unzipped EPUB and a Web Publication.
                               Please see also http://vivliostyle.github.io/vivliostyle.js/docs/en/
  --no-sandbox                  launch chrome without sandbox (use this option to avoid ECONNREFUSED error)
  -r, --root <root_directory>   specify assets root path (default directory of input file)
  --executable-chromium <path>  specify a path of executable Chrome(Chromium) you installed
  -h, --help                    output usage information
```

## Contributing

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

# Vivliostyle CLI

Save the pdf file via Headless Chrome and Vivliostyle.

## Install

```
npm install -g @vivliostyle/cli
```

## Usage

```
Usage: vivliostyle [options] <input>

Options:
  -V, --version                output the version number
  -b, --book                   load document as book mode
                               It can load multi-HTML documents such as an unzipped EPUB and a Web Publication.
                               Please see also http://vivliostyle.github.io/vivliostyle.js/docs/en/
  --no-sandbox                 launch chrome without sandbox (use this option to avoid ECONNREFUSED error)
  -r, --root <root_directory>  specify assets root path (default directory of input file)
  --preview                    open preview page and save PDF interactively
                               If preview option is set, options below this line will be ignored.
  -o, --output <output_file>   specify output file path (default output.pdf) (default: "output.pdf")
  -s, --size <size>            output pdf size (ex: 'A4' 'JIS-B5' '182mm,257mm' '8.5in,11in')
  -t, --timeout <time>         timeout times for waiting Vivliostyle process (default: 60s)
  -h, --help                   output usage information
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

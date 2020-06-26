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
  -v, --version   output the version number
  -h, --help      display help for command

Commands:
  init            create vivliostyle config
  build           build and create PDF file
  preview         launch preview server
  help [command]  display help for command
```

### `init`

> create vivliostyle config file.

```bash
vivliostyle init
```

### `build`

> build and create PDF file.

Put [vivliostyle.config.js](https://github.com/vivliostyle/vivliostyle-cli/issues/38) in the root directory, then:

```
vivliostyle build
```

![build](https://raw.githubusercontent.com/vivliostyle/vivliostyle-cli/master/assets/build.gif)

#### CLI options

```
Options:
  -c, --config <config_file>    path to vivliostyle.config.js
  -o, --output <output_file>    specify output file path (default
                                output.pdf)
  -r, --root <root_directory>   specify assets root path (default
                                directory of input file)
  -t, --theme <theme>           theme path or package name
  -s, --size <size>             output pdf size (ex: 'A4' 'JIS-B5'
                                '182mm,257mm' '8.5in,11in')
  --title <title>               title
  --author <author>             author
  --language <language>         language
  --press-ready                 make generated PDF compatible with
                                press ready PDF/X-1a
  --verbose                     verbose log output
  --timeout <seconds>           timeout limit for waiting Vivliostyle
                                process (default: 60s)
  --force-document-mode         force document mode. Further reading:
                                http://vivliostyle.github.io/vivliostyle.js/docs/en/
  --no-sandbox                  launch chrome without sandbox (use this
                                option to avoid ECONNREFUSED error)
  --executable-chromium <path>  specify a path of executable
                                Chrome(Chromium) you installed
  -h, --help                    display help for command
```

### `preview`

> Open preview page and save PDF interactively

```
vivliostyle preview <input>
```

#### CLI options

```
Options:
  -b, --book                    load document as book mode
                               It can load multi-HTML documents such as an unzipped EPUB and a Web Publication.
                               Please see also http://vivliostyle.github.io/vivliostyle.js/docs/en/
  --no-sandbox                  launch chrome without sandbox (use this
                                option to avoid ECONNREFUSED error)
  -r, --root <root_directory>   specify assets root path (default
                                directory of input file)
  --executable-chromium <path>  specify a path of executable
                                Chrome(Chromium) you installed
  -h, --help                    display help for command
```

## Contributing

See [Contribution Guide](CONTRIBUTING.md).

## License

Licensed under [AGPL Version 3](http://www.gnu.org/licenses/agpl.html).

![Vivliostyle CLI](assets/cover.jpg)

[![npm](https://flat.badgen.net/npm/v/@vivliostyle/cli)][npm-url]
[![npm: total downloads](https://flat.badgen.net/npm/dt/@vivliostyle/cli)][npm-url]

[npm-url]: https://npmjs.org/package/@vivliostyle/cli

Supercharge your command-line publication workflow.

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

You are new to Vivliostyle? Check out our latest project [Create Book](https://github.com/vivliostyle/create-book#readme).
With Create Book, you can easily bootstrap your book project and start writing without any extra effort.

#### CLI Options

```
Options:
  --title <title>            title
  --author <author>          author
  -l, --language <language>  language
  -s, --size  <size>         paper size
  -T, --theme <theme>        theme
  -h, --help                 display help for command
```

### `build`

> build and create PDF file.

Put [vivliostyle.config.js](https://github.com/vivliostyle/create-book/blob/master/templates/default/vivliostyle.config.js) in the root directory, then:

```bash
vivliostyle build
```

![build](assets/build.gif)

#### CLI options

```
Options:
  -c, --config <config_file>       path to vivliostyle.config.js [vivliostyle.config.js]
  -o, --output <path>              specify output file name or directory [<title>.pdf]
                                   This option can be specified multiple, then each -o options can be supplied one -f option.
                                   ex: -o output1 -f webpub -o output2.pdf -f pdf
  -f, --format <format>            specify output format corresponding output target
                                   If an extension is specified on -o option, this field will be inferenced automatically.
  -s, --size <size>                output pdf size [Letter]
                                   preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
                                   custom(comma separated): 182mm,257mm or 8.5in,11in
  --style <stylesheet>             additional stylesheet URL or path
  --user-style <user_stylesheet>   user stylesheet URL or path
  -d, --single-doc                 single HTML document input
  -p, --press-ready                make generated PDF compatible with press ready PDF/X-1a [false]
                                   This option is equivalent with "--preflight press-ready"
  -t, --timeout <seconds>          timeout limit for waiting Vivliostyle process [60s]
  -T, --theme <theme>              theme path or package name
  --title <title>                  title
  --author <author>                author
  -l, --language <language>        language
  --render-mode <mode>             if docker is set, Vivliostyle try to render PDF on Docker container [local] (choices: "local", "docker")
  --preflight <mode>               apply the process to generate PDF for printing (choices: "press-ready", "press-ready-local")
  --preflight-option <options...>  options for preflight process (ex: gray-scale, enforce-outline)
                                   Please refer the document of press-ready for further information.
                                   https://github.com/vibranthq/press-ready
  --verbose                        verbose log output
  --no-sandbox                     launch chrome without sandbox. use this option when ECONNREFUSED error occurred.
  --executable-chromium <path>     specify a path of executable Chrome (or Chromium) you installed
  --image <image>                  specify a docker image to render
  -h, --help                       display help for command
```

### `preview`

> open preview page and save PDF interactively.

```bash
vivliostyle preview
```

#### CLI options

```
Options:
  -c, --config <config_file>      path to vivliostyle.config.js
  -T, --theme <theme>             theme path or package name
  -s, --size <size>               output pdf size [Letter]
                                  preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
                                  custom(comma separated): 182mm,257mm or 8.5in,11in
  --style <stylesheet>            additional stylesheet URL or path
  --user-style <user_stylesheet>  user stylesheet URL or path
  -d, --single-doc                single HTML document input
  -q, --quick                     quick loading with rough page count
  --title <title>                 title
  --author <author>               author
  -l, --language <language>       language
  --verbose                       verbose log output
  --no-sandbox                    launch chrome without sandbox (use this option to avoid ECONNREFUSED error)
  --executable-chromium <path>    specify a path of executable Chrome(Chromium) you installed
  -h, --help                      display help for command
```

## User Guide

See [User Guide](https://docs.vivliostyle.org/#/vivliostyle-cli)

## Q&A

### Not working in Node v14.0.0

`puppeteer` is not working in Node v14.0.0, ie `vivliostyle-cli` is not working same.
See also: https://developers.google.com/web/tools/puppeteer/troubleshooting

The error has been resolved by Node `>= v14.1.0` or `<= v12.0.0`.

## Contribute

See [Contribution Guide](CONTRIBUTING.md).

[![](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/images/0)](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/links/0)[![](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/images/1)](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/links/1)[![](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/images/2)](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/links/2)[![](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/images/3)](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/links/3)[![](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/images/4)](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/links/4)[![](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/images/5)](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/links/5)[![](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/images/6)](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/links/6)[![](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/images/7)](https://sourcerer.io/fame/uetchy/vivliostyle/vivliostyle-cli/links/7)

## License

Licensed under [AGPL Version 3](http://www.gnu.org/licenses/agpl.html).

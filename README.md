![Vivliostyle CLI](assets/cover.jpg)

[![npm](https://flat.badgen.net/npm/v/@vivliostyle/cli)][npm-url]
[![npm: total downloads](https://flat.badgen.net/npm/dt/@vivliostyle/cli)][npm-url]

[npm-url]: https://npmjs.org/package/@vivliostyle/cli

<div align="center">
  <b>Supercharge your command-line publication workflow.</b>
</div>

# Vivliostyle CLI

## Install

```
npm install -g @vivliostyle/cli
```

## User Guide

See [User Guide](https://github.com/vivliostyle/vivliostyle-cli/tree/HEAD/docs#readme)

## Use

```
Usage: vivliostyle [options] [command]

Options:
  -v, --version   output the version number
  -h, --help      display help for command

Commands:
  create          Scaffold a new Vivliostyle project
  init            Create a Vivliostyle configuration file
  build           Create PDF, EPUB, and other publication files
  preview         Open the preview page and interactively save PDFs
  help [command]  display help for command
```

### `create`

> Scaffold a new Vivliostyle project

You are new to Vivliostyle? Check out our [Create Book](https://github.com/vivliostyle/vivliostyle-cli/tree/HEAD/packages/create-book#readme) project.
With Create Book, you can easily bootstrap your book project and start writing without any extra effort.

<details>
<summary><b>Full CLI options</b></summary>

```
Usage: vivliostyle create [options] [projectPath]

scaffold a new Vivliostyle project

Options:
  --title <title>               title
  --author <author>             author
  -l, --language <language>     language
  -s, --size <size>             paper size
  -T, --theme <theme>           theme
  --template <template>         Template source in the format of `[provider]:repo[/subpath][#ref]` or as a local directory to copy from.
  --install-dependencies        Install dependencies after creating a project.
  --no-install-dependencies     Do not install dependencies after creating a project.
  --create-config-file-only     Create a Vivliostyle config file without generating project template files.
  --proxy-server <proxyServer>  HTTP/SOCK proxy server url
  --proxy-bypass <proxyBypass>  optional comma-separated domains to bypass proxy
  --proxy-user <proxyUser>      optional username for HTTP proxy authentication
  --proxy-pass <proxyPass>      optional password for HTTP proxy authentication
  --log-level <level>           specify a log level of console outputs (choices: "silent", "info", "verbose", "debug", default: "info")
  -v, --version                 output the version number
  -h, --help                    display help for command
```

</details>

### `init`

> Create a Vivliostyle configuration file

<details>
<summary><b>Full CLI options</b></summary>

```
Usage: vivliostyle init [options]

create vivliostyle config file

Options:
  --title <title>            title
  --author <author>          author
  -l, --language <language>  language
  -s, --size <size>          paper size
  -T, --theme <theme>        theme
  --log-level <level>        specify a log level of console outputs (choices: "silent", "info", "verbose", "debug", default: "info")
  -v, --version              output the version number
  -h, --help                 display help for command
```

</details>

### `build`

> Create PDF, EPUB, and other publication files

<details>
<summary><b>Full CLI options</b></summary>

```
Usage: vivliostyle build [options] [input]

build and create PDF file

Options:
  -c, --config <config_file>         path to vivliostyle.config.js [vivliostyle.config.js]
  -o, --output <path>                specify output file name or directory [<title>.pdf]
                                     This option can be specified multiple, then each -o options can be supplied one -f option.
                                     ex: -o output1 -f webpub -o output2.pdf -f pdf
  -f, --format <format>              specify output format corresponding output target
                                     If an extension is specified on -o option, this field will be inferenced automatically.
  -s, --size <size>                  output pdf size
                                     preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
                                     custom(comma separated): 182mm,257mm or 8.5in,11in
  -m, --crop-marks                   print crop marks
  --bleed <bleed>                    extent of the bleed area for printing with crop marks [3mm]
  --crop-offset <offset>             distance between the edge of the trim size and the edge of the media size. [auto (13mm + bleed)]
  --css <CSS>                        custom style CSS code. (ex: ":root {--my-color: lime;}")
  --style <stylesheet>               additional stylesheet URL or path
  --user-style <user_stylesheet>     user stylesheet URL or path
  -d, --single-doc                   single HTML document input
  -p, --press-ready                  make generated PDF compatible with press ready PDF/X-1a [false]
                                     This option is equivalent with "--preflight press-ready"
  -t, --timeout <seconds>            timeout limit for waiting Vivliostyle process [300]
  -T, --theme <theme...>             theme path or package name
  --title <title>                    title
  --author <author>                  author
  -l, --language <language>          language
  --reading-progression <direction>  Direction of reading progression (choices: "ltr", "rtl")
  --render-mode <mode>               if docker is set, Vivliostyle try to render PDF on Docker container [local] (choices: "local", "docker")
  --preflight <mode>                 apply the process to generate PDF for printing (choices: "press-ready", "press-ready-local")
  --preflight-option <options...>    options for preflight process (ex: gray-scale, enforce-outline)
                                     Please refer the document of press-ready for further information.
                                     https://github.com/vibranthq/press-ready
  --executable-browser <path>        specify a path of executable browser you installed
  --image <image>                    specify a docker image to render
  --viewer <URL>                     specify a URL of displaying viewer instead of vivliostyle-cli's one
                                     It is useful that using own viewer that has staging features. (ex: https://vivliostyle.vercel.app/)
  --viewer-param <parameters>        specify viewer parameters. (ex: "allowScripts=false&pixelRatio=16")
  --browser <browser>                Specify a browser type and version to launch the Vivliostyle viewer (ex: chrome@129, firefox) [chrome]
  --proxy-server <proxyServer>       HTTP/SOCK proxy server url for underlying Playwright
  --proxy-bypass <proxyBypass>       optional comma-separated domains to bypass proxy
  --proxy-user <proxyUser>           optional username for HTTP proxy authentication
  --proxy-pass <proxyPass>           optional password for HTTP proxy authentication
  --log-level <level>                specify a log level of console outputs (choices: "silent", "info", "verbose", "debug", default: "info")
  --ignore-https-errors              true to ignore HTTPS errors when Playwright browser opens a new page
  --host <host>                      IP address the server should listen on
  --port <port>                      port the server should listen on
  --no-enable-static-serve           disable static file serving
  --vite-config-file <path>          Vite config file path
  --no-vite-config-file              ignore Vite config file even if it exists
  -v, --version                      output the version number
  -h, --help                         display help for command
```

</details>

### `preview`

> Open the preview page and interactively save PDFs

<details>
<summary><b>Full CLI options</b></summary>

```
Usage: vivliostyle preview [options] [input]

launch preview server

Options:
  -c, --config <config_file>         path to vivliostyle.config.js
  -T, --theme <theme...>             theme path or package name
  -s, --size <size>                  output pdf size
                                     preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
                                     custom(comma separated): 182mm,257mm or 8.5in,11in
  -m, --crop-marks                   print crop marks
  --bleed <bleed>                    extent of the bleed area for printing with crop marks [3mm]
  --crop-offset <offset>             distance between the edge of the trim size and the edge of the media size. [auto (13mm + bleed)]
  --css <CSS>                        custom style CSS code. (ex: ":root {--my-color: lime;}")
  --style <stylesheet>               additional stylesheet URL or path
  --user-style <user_stylesheet>     user stylesheet URL or path
  -d, --single-doc                   single HTML document input
  -q, --quick                        quick loading with rough page count
  --title <title>                    title
  --author <author>                  author
  -l, --language <language>          language
  --reading-progression <direction>  Direction of reading progression (choices: "ltr", "rtl")
  --executable-browser <path>        specify a path of executable browser you installed
  --viewer <URL>                     specify a URL of displaying viewer instead of vivliostyle-cli's one
                                     It is useful that using own viewer that has staging features. (ex: https://vivliostyle.vercel.app/)
  --viewer-param <parameters>        specify viewer parameters. (ex: "allowScripts=false&pixelRatio=16")
  --browser <browser>                Specify a browser type and version to launch the Vivliostyle viewer (ex: chrome@129, firefox) [chrome]
  --proxy-server <proxyServer>       HTTP/SOCK proxy server url for underlying Playwright
  --proxy-bypass <proxyBypass>       optional comma-separated domains to bypass proxy
  --proxy-user <proxyUser>           optional username for HTTP proxy authentication
  --proxy-pass <proxyPass>           optional password for HTTP proxy authentication
  --log-level <level>                specify a log level of console outputs (choices: "silent", "info", "verbose", "debug", default: "info")
  --ignore-https-errors              true to ignore HTTPS errors when Playwright browser opens a new page
  --host <host>                      IP address the server should listen on
  --port <port>                      port the server should listen on
  --no-open-viewer                   do not open viewer
  --no-enable-static-serve           disable static file serving
  --no-enable-viewer-start-page      disable viewer start page
  --vite-config-file <path>          Vite config file path
  --no-vite-config-file              ignore Vite config file even if it exists
  -v, --version                      output the version number
  -h, --help                         display help for command
```

</details>

## Contribute

See [Contribution Guide](CONTRIBUTING.md).

## License

Licensed under [AGPL Version 3](http://www.gnu.org/licenses/agpl.html).

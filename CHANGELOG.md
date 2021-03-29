# [3.2.0](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.1.2...v3.2.0) (2021-03-29)

### Bug Fixes

- Non-ASCII directory/file is not available. Error: Validation of pubManifest failed ([f84fca4](https://github.com/vivliostyle/vivliostyle-cli/commit/f84fca4aae6aa71ed37d2948b55de53535ab0429)), closes [#155](https://github.com/vivliostyle/vivliostyle-cli/issues/155)
- Preview watch not refreshed when CSS file is changed ([298ecf7](https://github.com/vivliostyle/vivliostyle-cli/commit/298ecf7da7fee9c7840f8c6d02e91621c7e314b9))

### Features

- Add --single-doc and --quick options ([6ccd68f](https://github.com/vivliostyle/vivliostyle-cli/commit/6ccd68fc36f30ce07e7bdfb7180d0e7f2d1b4daf))
- Add additional/user stylesheet options ([026306a](https://github.com/vivliostyle/vivliostyle-cli/commit/026306adbf7050103f3b2d265e62d5f3a013bc01)), closes [#112](https://github.com/vivliostyle/vivliostyle-cli/issues/112)
- Replace preview UI with Vivliostyle Viewer ([18265f2](https://github.com/vivliostyle/vivliostyle-cli/commit/18265f2f8999195e06cfbf976b021fd6de99888f)), closes [#41](https://github.com/vivliostyle/vivliostyle-cli/issues/41)

## [3.1.2](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.1.1...v3.1.2) (2021-03-06)

### Bug Fixes

- Failed to load from web because of CORS error ([1cb1baf](https://github.com/vivliostyle/vivliostyle-cli/commit/1cb1baf756d4ecb9466db6b17d7e1b58dfaa9dd3))
- Preview watch not working as expected ([7607d74](https://github.com/vivliostyle/vivliostyle-cli/commit/7607d744bbb37d690f8f5478e9f301886ddba2b9))

### Features

- Update vivliostyle core version to 2.5.2 ([b5ad780](https://github.com/vivliostyle/vivliostyle-cli/commit/b5ad78039edbe33be1b4fef97572b2b67274fb42))

## [3.1.1](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.1.0...v3.1.1) (2021-02-28)

# [3.1.0](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.3...v3.1.0) (2021-02-27)

### Bug Fixes

- exmaples/theme-preset size(JIS-B6 -> A5) ([a50fe02](https://github.com/vivliostyle/vivliostyle-cli/commit/a50fe0223795241b36afd5f630bf9eb6f54ac2ba))

### Features

- Update vivliostyle core version to 2.5 ([7b49393](https://github.com/vivliostyle/vivliostyle-cli/commit/7b493934d4258722ffa403ec636e1ee11069fb9b))

## [3.0.3](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.2...v3.0.3) (2021-02-09)

### Bug Fixes

- Update core deps ([f7ab4d3](https://github.com/vivliostyle/vivliostyle-cli/commit/f7ab4d346986cbb3d091fc3b6b51deb38e1dab15))

## [3.0.2](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.1...v3.0.2) (2021-02-09)

### Bug Fixes

- Place resources file on build time ([56a5e8b](https://github.com/vivliostyle/vivliostyle-cli/commit/56a5e8b9e4206a52a2456a0e84bbeed7549c4b6a))

## [3.0.1](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.0...v3.0.1) (2021-02-07)

### Bug Fixes

- Fix to raise errors on falsy input ([a38dd85](https://github.com/vivliostyle/vivliostyle-cli/commit/a38dd851ab232e6ee949b593b3579f88954fa2c5))

# :tada: [3.0.0](https://github.com/vivliostyle/vivliostyle-cli/compare/v2.1.3...v3.0.0) (2021-02-07)

## Introduce of the new configure file, `vivliostyle.config.js`!

We added support for a new config file format that allows you to save and share the build settings of your publications. See [examples](examples/) for a detailed description of what you can do with this config file.

## Revise the command line options (multiple output etc.)

The CLI command line options have been revised to allow for more flexible I/O configuration. The biggest topic is that we can now set multiple output destinations simultaneously!

```
vivliostyle build -o publication/ -f webpub -o draft.pdf -f pdf
```

## Support official Vivliostyle themes

We can now easily apply the various preset themes provided by Vivliostyle. Of course, you can also load your own CSS as a theme.

```
vivliostyle build input.md -T @vivliostyle/theme-techbook -o draft.pdf
```

# [3.0.0-rc.1](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.0-rc.0...v3.0.0-rc.1) (2021-02-07)

### Bug Fixes

- Can't load from Web URL ([e0e6689](https://github.com/vivliostyle/vivliostyle-cli/commit/e0e668951613ac49e5c253cf235f54e8af07c445))
- set process.cwd() to workspaceDir and entryContextDir ([811d879](https://github.com/vivliostyle/vivliostyle-cli/commit/811d8799f3a65ba472d01ee7212d0f2d4f270a5e))

### Features

- Add examples ([faca5c9](https://github.com/vivliostyle/vivliostyle-cli/commit/faca5c9bd30f6a7da4cecc4ff4095e72271b8b1d))

# [3.0.0-rc.0](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.0-pre.6...v3.0.0-rc.0) (2021-02-06)

### Bug Fixes

- Cancel to set toc as resources ([3bd5bdc](https://github.com/vivliostyle/vivliostyle-cli/commit/3bd5bdc2676a3e70bb694d1eadd5061f9922974f))
- Correct the behavior of exporting webbook ([f5c9ae2](https://github.com/vivliostyle/vivliostyle-cli/commit/f5c9ae292db7236a2763fb9b564518ace36fcd66))
- Delete the default language config ([b40f75f](https://github.com/vivliostyle/vivliostyle-cli/commit/b40f75fce9d6f698396fed4cdff8a5d0b06eafb9))
- Ensure to exit a process ([b59a39d](https://github.com/vivliostyle/vivliostyle-cli/commit/b59a39df47d9f54da5cccdf2a40baf1f406ea581))
- Fix build option parser ([5a1767a](https://github.com/vivliostyle/vivliostyle-cli/commit/5a1767a5e9dcff51c914d3b3176bc30b93a5e658))
- Fix judging method to detect entry file type ([ef63e7d](https://github.com/vivliostyle/vivliostyle-cli/commit/ef63e7d0cff546963183e9b80877518975b6341e))
- Fix process of removing tmp file ([8b1f4ba](https://github.com/vivliostyle/vivliostyle-cli/commit/8b1f4ba9cb382cfb5da53528a8fc9a3596cfcfc6))
- Fix the context resolver on specifying a config file ([918099a](https://github.com/vivliostyle/vivliostyle-cli/commit/918099aed9a001780d429ad801d6c912d9c1a143))
- Fix to reflect language settings to manuscript outputs ([35253d3](https://github.com/vivliostyle/vivliostyle-cli/commit/35253d30f9069e7007aabc42ed9709053f45a015))
- Make element selectable on broker UI ([5adf95c](https://github.com/vivliostyle/vivliostyle-cli/commit/5adf95c82e1245981436a31adeaafb6b145a6ef4))
- Merge output config correctly ([8b3b518](https://github.com/vivliostyle/vivliostyle-cli/commit/8b3b51809720e3ed1eb6d0fd81d8f7ea3b47b7cc))
- More graceful webbook exports ([07d89d5](https://github.com/vivliostyle/vivliostyle-cli/commit/07d89d5161f5196f4b17d8bcb6ce970205e4da03))
- Set project names from input context ([2358f65](https://github.com/vivliostyle/vivliostyle-cli/commit/2358f65052867ce0dd2fa0c860cd20c42e220064))
- Support implicit exports ([34a3a40](https://github.com/vivliostyle/vivliostyle-cli/commit/34a3a4018aa0c3f2326beec2a5e14ff593b91560))
- Support themes for HTML inputs and toc ([baeff19](https://github.com/vivliostyle/vivliostyle-cli/commit/baeff1924353bf2a4bff010283c6ab5c5fda5f14))
- Use Cheerio for (X)HTML parser ([1188952](https://github.com/vivliostyle/vivliostyle-cli/commit/118895217fc88884a845697ba0600b8d582c3619))
- Webbook export ([4eeb30a](https://github.com/vivliostyle/vivliostyle-cli/commit/4eeb30a53b864b9c17f43548718d1b5fee8fe234))

### Features

- Add `workspaceDir` `includeAssets` configs ([d1ce8b2](https://github.com/vivliostyle/vivliostyle-cli/commit/d1ce8b2081f7637f37c92454ec89dddc5f8aee8f))
- Add tests for config parser codes ([f123ee5](https://github.com/vivliostyle/vivliostyle-cli/commit/f123ee50b2e677bed08f934fbaa0e7eb89bb6efb))
- Add validator not to overwrite source files ([4fe2244](https://github.com/vivliostyle/vivliostyle-cli/commit/4fe22440b680d376b5756e78171fcbe044801234))
- Change to use hash by passing broker parameters ([1ea1ddd](https://github.com/vivliostyle/vivliostyle-cli/commit/1ea1ddd760b144802d1e5403b6572d88fb660f56))
- Drop supports of exporting web manifest from single HTML ([2494dc5](https://github.com/vivliostyle/vivliostyle-cli/commit/2494dc52faf5758fd143a157a0345a76fbc03756))
- Enable to set vivliostyle.config.js as an input argument ([860fed1](https://github.com/vivliostyle/vivliostyle-cli/commit/860fed1d73c463d3bce894aed1d6458ad5939968))
- Format auto-generated HTMLs ([399690d](https://github.com/vivliostyle/vivliostyle-cli/commit/399690d4cb9f1b49fe119ed34bf35fc9effe1f79))
- Implement in-place file transform ([b8eb374](https://github.com/vivliostyle/vivliostyle-cli/commit/b8eb37440e971c00e03257192192ba60ff10b38d))
- Implement multiple target outputs ([8603dbf](https://github.com/vivliostyle/vivliostyle-cli/commit/8603dbfd529bd596cfc3d5b465e19eee2c66b367))
- Import Publication Manifest schema ([1ef8483](https://github.com/vivliostyle/vivliostyle-cli/commit/1ef84833a3dadcdcdfa4240423e6c6abeb3e455e))
- Rename manifest.json to publication.json ([5556932](https://github.com/vivliostyle/vivliostyle-cli/commit/555693265f866708b692df50b1cfd7f9c7d3530f))
- Rename output format; webbook -> webpub ([04472ed](https://github.com/vivliostyle/vivliostyle-cli/commit/04472edbaa475391d3e720764926f07313520320))
- Revise CLI options ([aca9cf3](https://github.com/vivliostyle/vivliostyle-cli/commit/aca9cf3285ff4cec28dd341c34dd185ac11ef8cc))
- Support multiple -o and -f options ([50f57ca](https://github.com/vivliostyle/vivliostyle-cli/commit/50f57cad8016b41d5c4c97dc4635141425f459cd))
- Support to input publication manifests directly ([23a5ec7](https://github.com/vivliostyle/vivliostyle-cli/commit/23a5ec7762d0549d2ceead85261fae61d77c5169))
- Support various input formats ([4e75580](https://github.com/vivliostyle/vivliostyle-cli/commit/4e75580d5ba5e79b487d42d6db6bc19d0b7334f4))
- Support webbook export of single entry ([71d3fb2](https://github.com/vivliostyle/vivliostyle-cli/commit/71d3fb228e0ec9f3b9cb4a1fa128b483daafdea1))
- Support zipped EPUB inputs ([dac8afc](https://github.com/vivliostyle/vivliostyle-cli/commit/dac8afc07795910e188f5e17ee27d4dbace527e5))
- Update config schema ([b8f4be4](https://github.com/vivliostyle/vivliostyle-cli/commit/b8f4be41b736ac52e592783b79201a5eb8e36e9e))
- Update manifest schema ([fb6d955](https://github.com/vivliostyle/vivliostyle-cli/commit/fb6d955bc4c5f3026330776a3f391a779403a69e))
- Update the config template ([e09a898](https://github.com/vivliostyle/vivliostyle-cli/commit/e09a898842fffc749f47aae2839209fcf02a2440))
- Update toc APIs ([78e2d1b](https://github.com/vivliostyle/vivliostyle-cli/commit/78e2d1bef4daee343ab75aa9010a1446269bd37d))
- Use file-based protocol to serve the broker page ([b10f446](https://github.com/vivliostyle/vivliostyle-cli/commit/b10f44688102e0dbcc5ae63a63ed15d47661ee68))

# [3.0.0-pre.6](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.0-pre.5...v3.0.0-pre.6) (2021-01-13)

### Bug Fixes

- Local theme package copied to wrong place when updated during preview ([ee05f3e](https://github.com/vivliostyle/vivliostyle-cli/commit/ee05f3e18932fc8f27c5343e9353cf16d2810359)), closes [#93](https://github.com/vivliostyle/vivliostyle-cli/issues/93)

### Features

- display stacktrace on error ([42ca8f1](https://github.com/vivliostyle/vivliostyle-cli/commit/42ca8f11c049758f6c2c30d640ce14caeae52216))

# [3.0.0-pre.5](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.0-pre.4...v3.0.0-pre.5) (2020-12-30)

### Bug Fixes

- --language,--size, --theme options for init command is not working. ([6feec71](https://github.com/vivliostyle/vivliostyle-cli/commit/6feec71c13c5f0f2dce737c22d49d0b26a9fd610))
- include yarn.lock ([605897e](https://github.com/vivliostyle/vivliostyle-cli/commit/605897ef6884a92d110fd8f3eb4004bfaf1dae5b))
- remove .posix and update upath 2.0.1 ([594b8dd](https://github.com/vivliostyle/vivliostyle-cli/commit/594b8dd8099a57b677d2c713f6b06a8b136fff07))
- toc test fails due to separator on Windows ([6a4ab12](https://github.com/vivliostyle/vivliostyle-cli/commit/6a4ab121f01f466fe43d7a0e233f77e69616def4))

### Features

- init command document to 3.0.0 specification ([32906ef](https://github.com/vivliostyle/vivliostyle-cli/commit/32906efa0726f23531862682c86878f5d91cfe05))
- init command to 3.0.0 specification ([cf30818](https://github.com/vivliostyle/vivliostyle-cli/commit/cf308180565413399c0367f149d9e6eaa00942d7))

# [3.0.0-pre.4](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.0-pre.3...v3.0.0-pre.4) (2020-11-01)

# [3.0.0-pre.3](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.0-pre.2...v3.0.0-pre.3) (2020-08-06)

### Bug Fixes

- Errors due to path problem on Windows ([8eeadee](https://github.com/vivliostyle/vivliostyle-cli/commit/8eeadeed053a1e665c94c95d5cc5b5f0debbecde))

### Features

- inject title and style into raw html as well ([d9afa06](https://github.com/vivliostyle/vivliostyle-cli/commit/d9afa06904b5b1abeef4763365d1814305cb9ed0))

# [3.0.0-pre.2](https://github.com/vivliostyle/vivliostyle-cli/compare/v3.0.0-pre.1...v3.0.0-pre.2) (2020-07-02)

### Bug Fixes

- avoid infinite globby loop ([e7d9d64](https://github.com/vivliostyle/vivliostyle-cli/commit/e7d9d643cfb5edc6fbb2a657f41e4afe0e35ea58))
- flush before running press-ready ([de28656](https://github.com/vivliostyle/vivliostyle-cli/commit/de286567c0159fe5faa341650a4e6f541f84020d))
- prepend toc ([141c657](https://github.com/vivliostyle/vivliostyle-cli/commit/141c657e924729786d5e08e73ca6a35d011c55e6))
- remove unncessary options ([3151d16](https://github.com/vivliostyle/vivliostyle-cli/commit/3151d16488ae5f87a6578f686657c1f081f0e3da))
- use title as a output filename ([0e3b31a](https://github.com/vivliostyle/vivliostyle-cli/commit/0e3b31adb1561386db8bc07e11ad68ff66913805))
- **init:** abort if config file exists ([8e45ab1](https://github.com/vivliostyle/vivliostyle-cli/commit/8e45ab1381b71d476568572f4ddf6fc01f5d2d41))
- startLogging after error ([1c6670d](https://github.com/vivliostyle/vivliostyle-cli/commit/1c6670d16c6cbe96591866b89884b1bae7457251))

### Features

- cover field ([bc3a70e](https://github.com/vivliostyle/vivliostyle-cli/commit/bc3a70ecd7a7ce099a0b9f88af8c4b842a23a3d6))
- validate vivliostyle.config.js ([7e43b1e](https://github.com/vivliostyle/vivliostyle-cli/commit/7e43b1e2eb3f1ff197970abe5f8c54f60173d8a1))

## 2.0.0-pre.0 (2019-12-19)

- :arrow_up: Version 1.3.0 ([173420b](https://github.com/vivliostyle/vivliostyle-cli/commit/173420b))
- :arrow_up: Version 1.3.1 ([04bfa6f](https://github.com/vivliostyle/vivliostyle-cli/commit/04bfa6f))
- #11 #13 Fix entrypoint loader to load EPUB and XHTML ([2cc03eb](https://github.com/vivliostyle/vivliostyle-cli/commit/2cc03eb))
- 2.0.0-pre.0 ([c5f33d0](https://github.com/vivliostyle/vivliostyle-cli/commit/c5f33d0))
- Add instruction ([1ed2787](https://github.com/vivliostyle/vivliostyle-cli/commit/1ed2787))
- Adopt subcommand system ([158c9e8](https://github.com/vivliostyle/vivliostyle-cli/commit/158c9e8))
- Create README.md ([7b71309](https://github.com/vivliostyle/vivliostyle-cli/commit/7b71309))
- fix broker path ([964af52](https://github.com/vivliostyle/vivliostyle-cli/commit/964af52))
- Rename save -> build ([1af35d3](https://github.com/vivliostyle/vivliostyle-cli/commit/1af35d3))
- Rename viola -> vivliostyle ([d55299b](https://github.com/vivliostyle/vivliostyle-cli/commit/d55299b))
- Update codes for new command name ([7422282](https://github.com/vivliostyle/vivliostyle-cli/commit/7422282))
- Update test command ([c2b0bee](https://github.com/vivliostyle/vivliostyle-cli/commit/c2b0bee))
- Use serve-handler ([3c6a36d](https://github.com/vivliostyle/vivliostyle-cli/commit/3c6a36d))
- Vivliostyle 2019.1.106 ([a680a61](https://github.com/vivliostyle/vivliostyle-cli/commit/a680a61))
- Vivliostyle 2019.8.101 ([7d5f94c](https://github.com/vivliostyle/vivliostyle-cli/commit/7d5f94c))
- fix: add enum definitions ([391f2ac](https://github.com/vivliostyle/vivliostyle-cli/commit/391f2ac))
- fix: automatically find chrome port to avoid conflict ([bd0d213](https://github.com/vivliostyle/vivliostyle-cli/commit/bd0d213)), closes [#24](https://github.com/vivliostyle/vivliostyle-cli/issues/24)
- fix: cover chrome-remote-interface ([5f3bbed](https://github.com/vivliostyle/vivliostyle-cli/commit/5f3bbed))
- fix: migrate from vivliostyle to @vivliostyle/core ([980ca9c](https://github.com/vivliostyle/vivliostyle-cli/commit/980ca9c))
- fix: port cli to TypeScript ([1b29b2c](https://github.com/vivliostyle/vivliostyle-cli/commit/1b29b2c))
- fix(npm): publish /broker to npm ([a6f1c2f](https://github.com/vivliostyle/vivliostyle-cli/commit/a6f1c2f))
- fix(test): test subcommand ([e0baff1](https://github.com/vivliostyle/vivliostyle-cli/commit/e0baff1))
- chore: add keywords, homepage, bugs to package.json ([aee4c6c](https://github.com/vivliostyle/vivliostyle-cli/commit/aee4c6c))
- chore: add prettier to match styles ([90addac](https://github.com/vivliostyle/vivliostyle-cli/commit/90addac))
- chore: add travis ([1ffbb02](https://github.com/vivliostyle/vivliostyle-cli/commit/1ffbb02))
- chore: cosmetic changes ([478dfa1](https://github.com/vivliostyle/vivliostyle-cli/commit/478dfa1))
- chore: cosmetic changes ([71586e1](https://github.com/vivliostyle/vivliostyle-cli/commit/71586e1))
- chore: export interfaces ([7aeac7f](https://github.com/vivliostyle/vivliostyle-cli/commit/7aeac7f))
- chore: fix command ([f9966de](https://github.com/vivliostyle/vivliostyle-cli/commit/f9966de))
- chore: Fix editorconfig ([7aa65c7](https://github.com/vivliostyle/vivliostyle-cli/commit/7aa65c7))
- chore: ignore clutter ([4d8896c](https://github.com/vivliostyle/vivliostyle-cli/commit/4d8896c))
- chore: omit viola-savepdf notice ([7271553](https://github.com/vivliostyle/vivliostyle-cli/commit/7271553))
- chore: publish declaration files ([fa47ff9](https://github.com/vivliostyle/vivliostyle-cli/commit/fa47ff9))
- chore: remove Makefile in favor of proper test suite ([365f427](https://github.com/vivliostyle/vivliostyle-cli/commit/365f427))
- chore: rename vivliostyle-savepdf to @vivliostyle/cli ([8152e1f](https://github.com/vivliostyle/vivliostyle-cli/commit/8152e1f))
- chore: update deps ([d151840](https://github.com/vivliostyle/vivliostyle-cli/commit/d151840))
- chore: update preact from 8 to 10 ([1036990](https://github.com/vivliostyle/vivliostyle-cli/commit/1036990))
- chore(test): fix test to show stderr when command failed ([865bf2e](https://github.com/vivliostyle/vivliostyle-cli/commit/865bf2e))
- test: add test ([7512f9b](https://github.com/vivliostyle/vivliostyle-cli/commit/7512f9b))
- test: checks if savepdf generates pdf without err ([9694093](https://github.com/vivliostyle/vivliostyle-cli/commit/9694093))
- test: invoke test before push ([62b5b87](https://github.com/vivliostyle/vivliostyle-cli/commit/62b5b87))
- feat: mvp ([683c5de](https://github.com/vivliostyle/vivliostyle-cli/commit/683c5de))

### BREAKING CHANGE

- command has been changed from savepdf to vivliostyle

## <small>1.2.7 (2019-03-11)</small>

- :arrow_up: version 1.2.2 ([d07dfe1](https://github.com/vivliostyle/vivliostyle-cli/commit/d07dfe1))
- :arrow_up: version 1.2.3 ([8f8cc72](https://github.com/vivliostyle/vivliostyle-cli/commit/8f8cc72))
- :arrow_up: version 1.2.4 ([60987a6](https://github.com/vivliostyle/vivliostyle-cli/commit/60987a6))
- :arrow_up: Version 1.2.5 ([5cf0999](https://github.com/vivliostyle/vivliostyle-cli/commit/5cf0999))
- :arrow_up: Version 1.2.6 ([326e6b7](https://github.com/vivliostyle/vivliostyle-cli/commit/326e6b7))
- :arrow_up: Version 1.2.7 ([358e96b](https://github.com/vivliostyle/vivliostyle-cli/commit/358e96b))
- add 'root' cli option ([47773a1](https://github.com/vivliostyle/vivliostyle-cli/commit/47773a1))
- Add book mode ([c34a99c](https://github.com/vivliostyle/vivliostyle-cli/commit/c34a99c))
- Add Dockerfile ([c86c03f](https://github.com/vivliostyle/vivliostyle-cli/commit/c86c03f))
- Bump dependency versions ([8f4c4e3](https://github.com/vivliostyle/vivliostyle-cli/commit/8f4c4e3))
- Bump up dependency versions ([22d8b0f](https://github.com/vivliostyle/vivliostyle-cli/commit/22d8b0f))
- change option order / pass root option to preview mode ([913f20d](https://github.com/vivliostyle/vivliostyle-cli/commit/913f20d))
- fix index path in save.js ([3061be8](https://github.com/vivliostyle/vivliostyle-cli/commit/3061be8))
- fix listen address to localhost ([43d40ca](https://github.com/vivliostyle/vivliostyle-cli/commit/43d40ca))
- Fix parsing preset size ([5f2a7c5](https://github.com/vivliostyle/vivliostyle-cli/commit/5f2a7c5))
- Improve preview page navigator ([016899a](https://github.com/vivliostyle/vivliostyle-cli/commit/016899a))
- Integrate MathJax ([db5b2eb](https://github.com/vivliostyle/vivliostyle-cli/commit/db5b2eb))
- Make configurable loading mode ([068ed0b](https://github.com/vivliostyle/vivliostyle-cli/commit/068ed0b))
- remove part of query string from path ([e5021f6](https://github.com/vivliostyle/vivliostyle-cli/commit/e5021f6))
- Show app version in preview page ([afeeea3](https://github.com/vivliostyle/vivliostyle-cli/commit/afeeea3))
- support to flattened node_modules ([d3bc592](https://github.com/vivliostyle/vivliostyle-cli/commit/d3bc592))
- Update to show the vivliostyle version ([3fa880d](https://github.com/vivliostyle/vivliostyle-cli/commit/3fa880d))
- Update urls for Vivliostyle.org ([f89a326](https://github.com/vivliostyle/vivliostyle-cli/commit/f89a326))

## <small>1.2.1 (2017-12-08)</small>

- :arrow_up: version 1.2.1 ([7b020bd](https://github.com/vivliostyle/vivliostyle-cli/commit/7b020bd))
- add --no-sandbox option ([d4e51bd](https://github.com/vivliostyle/vivliostyle-cli/commit/d4e51bd))
- add a guide message in case of ECONNREFUSED error ([5ec588e](https://github.com/vivliostyle/vivliostyle-cli/commit/5ec588e))
- add a guide message in case of ECONNREFUSED error in headless mode ([67bdf64](https://github.com/vivliostyle/vivliostyle-cli/commit/67bdf64))
- Fix error handling ([2e7648a](https://github.com/vivliostyle/vivliostyle-cli/commit/2e7648a))
- make previewer enable to launch without sandbox ([bf2727d](https://github.com/vivliostyle/vivliostyle-cli/commit/bf2727d))
- make save.js enable to launch without sandbox ([caca589](https://github.com/vivliostyle/vivliostyle-cli/commit/caca589))

## 1.2.0 (2017-11-21)

- :arrow_up: version 1.2.0 ([a43717e](https://github.com/vivliostyle/vivliostyle-cli/commit/a43717e))
- Add preview mode ([a4acbe1](https://github.com/vivliostyle/vivliostyle-cli/commit/a4acbe1))
- Fix print CSS ([60f9c09](https://github.com/vivliostyle/vivliostyle-cli/commit/60f9c09))
- Improve broker page ([e86d410](https://github.com/vivliostyle/vivliostyle-cli/commit/e86d410))
- Update package ([a838577](https://github.com/vivliostyle/vivliostyle-cli/commit/a838577))

## 1.1.0 (2017-08-02)

- :arrow_up: version 1.1.0 ([5fa41c8](https://github.com/vivliostyle/vivliostyle-cli/commit/5fa41c8))
- Add page size option ([32d89b4](https://github.com/vivliostyle/vivliostyle-cli/commit/32d89b4))
- Create LICENSE ([ee6d44e](https://github.com/vivliostyle/vivliostyle-cli/commit/ee6d44e))
- Implement very simple script ([a748e18](https://github.com/vivliostyle/vivliostyle-cli/commit/a748e18))
- Set print media emulation ([36370de](https://github.com/vivliostyle/vivliostyle-cli/commit/36370de))

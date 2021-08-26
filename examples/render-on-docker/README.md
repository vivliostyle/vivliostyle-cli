# Render on Docker

By setting `renderMode: 'docker'` option, Vivliostyle tries to render on Docker container.

### vivliostyle.config.js

```js
module.exports = {
  title: 'Demonstration of Render mode',
  language: 'en',
  size: '100mm,100mm',
  entry: 'manuscript.md',
  // Docker image name for rendering
  image: 'ghcr.io/vivliostyle/cli:latest',
  output: [
    {
      // Render on docker container
      renderMode: 'docker',
      path: 'draft_docker.pdf',
    },
    {
      // If renderMode is not set, Vivliostyle will render it on host OS
      // renderMode: 'local',
      path: 'draft_local.pdf',
    }
  ],
};
```

## Things to know

* Since Docker is isolated from the host environment, it cannot use the fonts installed on the host. There are only a limited number of fonts that can be used as standard in Docker containers, and you usually need to place local font files and specify them with CSS, or use web fonts such as Google font.
* The only file that will be mounted in Docker is _the project workspace directory_ (usually the directory containing vivliostyle.config.js), other files cannot be referenced from inside the Docker container. All files that are referenced in the document, such as images, should be included in the workspace directory.

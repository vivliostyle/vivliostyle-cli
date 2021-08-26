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

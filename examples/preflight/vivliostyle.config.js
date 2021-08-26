module.exports = {
  title: 'Preflight',
  language: 'en',
  size: 'letter',
  entry: 'manuscript.html',
  // Docker image name for preflight
  image: 'ghcr.io/vivliostyle/cli:latest',
  output: [
    {
      path: 'draft.pdf',
    },
    {
      path: 'draft_press_ready.pdf',
      // press-ready: runs press-ready on Docker container
      // press-ready-local: runs press-ready without Docker
      preflight: 'press-ready',
      // preflight: 'press-ready-local',
      preflightOption: [
        // Options for press-ready
        // Please refer https://github.com/vibranthq/press-ready#options for the details
        'gray-scale',
        'enforce-outline',
      ],
    }
  ],
};

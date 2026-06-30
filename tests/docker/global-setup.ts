import { getContainerRuntimeClient, ImageName } from 'testcontainers';

import { imageRef } from './support.js';

// Fail fast, once, before any test: confirm VIVLIOSTYLE_CLI_IMAGE is set and make
// sure the image is present locally so the inspect-only metadata checks have
// something to read. testcontainers pulls on `.start()`, but `client.image.inspect`
// does not, so pull it up front when missing.
export default async function setup(): Promise<void> {
  const name = ImageName.fromString(imageRef());
  const client = await getContainerRuntimeClient();
  if (!(await client.image.exists(name))) {
    await client.image.pull(name);
  }
}

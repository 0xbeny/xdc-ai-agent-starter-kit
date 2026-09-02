import { join } from 'node:path'

import { createFetchTools } from './fetch-url.ts'
import { getKit } from './kit.ts'
import { createSandboxTools, sandboxMode } from './sandbox.ts'

/** One sandbox + fetch toolset shared by the assistant and its sub-agents, so delegation never loses capabilities. */
const kit = getKit()
const { config } = kit

export const sandbox =
  sandboxMode(config.env) === 'local'
    ? createSandboxTools({
        dataDir: config.dataDir,
        allowNetwork: config.env.SANDBOX_ALLOW_NETWORK === '1',
        extraPaths: () => kit.grants.paths(),
      })
    : undefined

// Downloading never depends on the sandbox: without one, files land in data/downloads.
export const fetchTools = createFetchTools(
  sandbox ? sandbox.dir : join(config.dataDir, 'downloads'),
)

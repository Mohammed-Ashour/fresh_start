/**
 * Exit Command Extension
 *
 * Registers /exit as an alias for /quit
 * Both commands trigger graceful shutdown
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("exit", {
    description: "Exit pi (alias for /quit)",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    },
  });
}

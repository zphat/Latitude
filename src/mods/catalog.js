// Source-reviewed modules are lazy: disabled modules import no implementation.
// JSON packs cannot register executable code.
export const TRUSTED_MODS = [
  {
    manifest: {
      id: "latitude-streaming",
      name: "Latitude Streaming",
      version: "0.1.0-beta",
      author: "Latitude",
      apiVersion: 1,
      description:
        "Broadcast your Studio scene and finished audio mix to an RTMP or RTMPS destination. Optional, with independent local recording.",
      capabilities: ["live-output", "stream-transport", "workspace-panel"],
    },
    load: () => import("./streaming/index.js"),
  },
];

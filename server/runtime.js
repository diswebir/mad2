// Keep runtime, installer and package engines aligned with the Vite toolchain.
export function supportedNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  return (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
}

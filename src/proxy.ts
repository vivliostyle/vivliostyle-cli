export function resolveProxyBypass(override?: string): string | undefined {
  return (
    override ??
    process.env.NOPROXY ??
    process.env.NO_PROXY ??
    process.env.no_proxy ??
    undefined
  );
}

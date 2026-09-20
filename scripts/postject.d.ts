declare module 'postject' {
  interface InjectOptions {
    machoSegmentName?: string;
    sentinelFuse: string;
  }

  type Inject = (
    ...args: [string, string, Buffer, InjectOptions]
  ) => Promise<void>;

  const inject: Inject;

  export { inject };
}

/**
 * Shared conformance-suite runner per design Decision 6: every outbound
 * port gets a stub adapter first plus one `<port>.contract.ts` suite that
 * exercises any adapter implementing that port (stub in CI, real adapter
 * nightly once credentials exist). A contract file exports a
 * `ConformanceSpec<TPort>`; `runConformanceSuite` runs it against any
 * `createAdapter` factory and fails loudly, naming the violated case, when
 * the adapter deviates from the documented contract.
 */
export interface ConformanceCase<TPort> {
  name: string;
  run(port: TPort): Promise<void>;
}

export interface ConformanceSpec<TPort> {
  cases: ConformanceCase<TPort>[];
}

export async function runConformanceSuite<TPort>(
  createAdapter: () => TPort,
  spec: ConformanceSpec<TPort>,
): Promise<void> {
  for (const testCase of spec.cases) {
    // Fresh adapter per case: cases stay independent and order-agnostic.
    const adapter = createAdapter();
    try {
      await testCase.run(adapter);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Conformance case "${testCase.name}" failed: ${reason}`);
    }
  }
}

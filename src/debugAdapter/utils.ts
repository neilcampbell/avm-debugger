import * as path from 'path';
import * as JSONbigWithoutConfig from 'json-bigint';
import * as algosdk from 'algosdk';

export interface FileAccessor {
  isWindows: boolean;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
}

export function isValidUtf8(data: Uint8Array): boolean {
  const dataBuffer = Buffer.from(data);
  const decoded = dataBuffer.toString('utf-8');
  return Buffer.from(decoded).equals(dataBuffer);
}

export function limitArray<T>(
  array: Array<T>,
  start?: number,
  count?: number,
): Array<T> {
  if (start === undefined) {
    start = 0;
  }
  if (count === undefined) {
    count = array.length;
  }
  if (start < 0) {
    start = 0;
  }
  if (count < 0) {
    count = 0;
  }
  if (start >= array.length) {
    return [];
  }
  if (start + count > array.length) {
    count = array.length - start;
  }
  return array.slice(start, start + count);
}

// TODO: replace with algosdk.parseJson once it is available in v3
export function parseJsonWithBigints(json: string): any {
  // Our tests wants this lib to be imported as `import * as JSONbig from 'json-bigint';`,
  // but running this in vscode wants it to be imported as `import JSONbig from 'json-bigint';`.
  // This is a hack to allow both.
  let target = JSONbigWithoutConfig;
  if (target.default) {
    target = target.default;
  }
  const JSON_BIG = target({ useNativeBigInt: true, strict: true });
  return JSON_BIG.parse(json);
}

export class ByteArrayMap<T> {
  private map: Map<string, T>;

  constructor(entries?: Iterable<[Uint8Array, T]> | null) {
    this.map = new Map<string, T>();
    for (const [key, value] of entries || []) {
      this.set(key, value);
    }
  }

  public get size(): number {
    return this.map.size;
  }

  public set(key: Uint8Array, value: T): void {
    this.map.set(Buffer.from(key).toString('hex'), value);
  }

  public setHex(key: string, value: T): void {
    this.map.set(key, value);
  }

  public get(key: Uint8Array): T | undefined {
    return this.map.get(Buffer.from(key).toString('hex'));
  }

  public getHex(key: string): T | undefined {
    return this.map.get(key);
  }

  public hasHex(key: string): boolean {
    return this.map.has(key);
  }

  public has(key: Uint8Array): boolean {
    return this.map.has(Buffer.from(key).toString('hex'));
  }

  public delete(key: Uint8Array): boolean {
    return this.map.delete(Buffer.from(key).toString('hex'));
  }

  public deleteHex(key: string): boolean {
    return this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }

  public *entries(): IterableIterator<[Uint8Array, T]> {
    for (const [key, value] of this.map.entries()) {
      yield [Buffer.from(key, 'hex'), value];
    }
  }

  public entriesHex(): IterableIterator<[string, T]> {
    return this.map.entries();
  }

  public clone(): ByteArrayMap<T> {
    const clone = new ByteArrayMap<T>();
    clone.map = new Map(this.map.entries());
    return clone;
  }
}

function filePathRelativeTo(base: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(path.dirname(base), filePath);
}

interface ProgramSourceEntryFile {
  'txn-group-sources': ProgramSourceEntry[];
}

interface ProgramSourceEntry {
  hash: string;
  'sourcemap-location': string;
}

export class ProgramSourceDescriptor {
  public readonly sourcemapFileLocation: string;
  public readonly sourcemap: algosdk.SourceMap;
  public readonly hash: Uint8Array;

  constructor({
    sourcemapFileLocation,
    sourcemap,
    hash,
  }: {
    sourcemapFileLocation: string;
    sourcemap: algosdk.SourceMap;
    hash: Uint8Array;
  }) {
    this.sourcemapFileLocation = sourcemapFileLocation;
    this.sourcemap = sourcemap;
    this.hash = hash;
  }

  public sourcePaths(): string[] {
    return this.sourcemap.sources.map((_, index) =>
      this.getFullSourcePath(index),
    );
  }

  public getFullSourcePath(index: number): string {
    return filePathRelativeTo(
      this.sourcemapFileLocation,
      this.sourcemap.sources[index],
    );
  }

  static async fromJSONObj(
    fileAccessor: FileAccessor,
    originFile: string,
    data: ProgramSourceEntry,
  ): Promise<ProgramSourceDescriptor> {
    const sourcemapFileLocation = filePathRelativeTo(
      originFile,
      data['sourcemap-location'],
    );
    const rawSourcemap = Buffer.from(
      await prefixPotentialError(
        fileAccessor.readFile(sourcemapFileLocation),
        'Could not read source map file',
      ),
    );
    const sourcemap = new algosdk.SourceMap(
      JSON.parse(rawSourcemap.toString('utf-8')),
    );

    return new ProgramSourceDescriptor({
      sourcemapFileLocation,
      sourcemap,
      hash: new Uint8Array(Buffer.from(data.hash, 'base64')),
    });
  }
}

export class ProgramSourceDescriptorRegistry {
  private registry: ByteArrayMap<ProgramSourceDescriptor>;

  constructor({
    txnGroupSources,
  }: {
    txnGroupSources: ProgramSourceDescriptor[];
  }) {
    this.registry = new ByteArrayMap(
      txnGroupSources.map((source) => [source.hash, source]),
    );
  }

  public findByHash(hash: Uint8Array): ProgramSourceDescriptor | undefined {
    return this.registry.get(hash);
  }

  static async loadFromFile(
    fileAccessor: FileAccessor,
    programSourcesDescriptionFilePath: string,
  ): Promise<ProgramSourceDescriptorRegistry> {
    const rawSourcesDescription = Buffer.from(
      await prefixPotentialError(
        fileAccessor.readFile(programSourcesDescriptionFilePath),
        'Could not read program sources description file',
      ),
    );
    let jsonSourcesDescription: ProgramSourceEntryFile;
    try {
      jsonSourcesDescription = JSON.parse(
        rawSourcesDescription.toString('utf-8'),
      ) as ProgramSourceEntryFile;
      if (
        !Array.isArray(jsonSourcesDescription['txn-group-sources']) ||
        !jsonSourcesDescription['txn-group-sources'].every(
          (entry) =>
            typeof entry.hash === 'string' &&
            typeof entry['sourcemap-location'] === 'string',
        )
      ) {
        throw new Error('Invalid program sources description file');
      }
    } catch (e) {
      const err = e as Error;
      throw new Error(
        `Could not parse program sources description file from '${programSourcesDescriptionFilePath}': ${err.message}`,
      );
    }
    const programSources = jsonSourcesDescription['txn-group-sources'].map(
      (source) =>
        ProgramSourceDescriptor.fromJSONObj(
          fileAccessor,
          programSourcesDescriptionFilePath,
          source,
        ),
    );
    return new ProgramSourceDescriptorRegistry({
      txnGroupSources: await Promise.all(programSources),
    });
  }
}

export class TEALDebuggingAssets {
  constructor(
    public readonly simulateResponse: algosdk.modelsv2.SimulateResponse,
    public readonly programSourceDescriptorRegistry: ProgramSourceDescriptorRegistry,
  ) {}

  static async loadFromFiles(
    fileAccessor: FileAccessor,
    simulateTraceFilePath: string,
    programSourcesDescriptionFilePath: string,
  ): Promise<TEALDebuggingAssets> {
    const rawSimulateTrace = Buffer.from(
      await prefixPotentialError(
        fileAccessor.readFile(simulateTraceFilePath),
        'Could not read simulate trace file',
      ),
    );
    let simulateResponse: algosdk.modelsv2.SimulateResponse;
    try {
      simulateResponse =
        algosdk.modelsv2.SimulateResponse.from_obj_for_encoding(
          parseJsonWithBigints(rawSimulateTrace.toString('utf-8')),
        );
    } catch (e) {
      const err = e as Error;
      throw new Error(
        `Could not parse simulate trace file from '${simulateTraceFilePath}': ${err.message}`,
      );
    }

    const txnGroupDescriptorList =
      await ProgramSourceDescriptorRegistry.loadFromFile(
        fileAccessor,
        programSourcesDescriptionFilePath,
      );

    return new TEALDebuggingAssets(simulateResponse, txnGroupDescriptorList);
  }
}

function prefixPotentialError<T>(task: Promise<T>, prefix: string): Promise<T> {
  return task.catch((error) => {
    throw new Error(`${prefix}: ${error.message}`);
  });
}

if (typeof (globalThis as any).File === 'undefined') {
  class FilePolyfill extends Blob {
    name: string;
    lastModified: number;

    constructor(parts: BlobPart[], fileName: string, options?: FilePropertyBag) {
      super(parts, options);
      this.name = fileName;
      this.lastModified = options?.lastModified ?? Date.now();
    }
  }

  (globalThis as any).File = FilePolyfill;
}

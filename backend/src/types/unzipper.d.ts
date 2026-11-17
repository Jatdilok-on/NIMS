declare module 'unzipper' {
  export interface ZipEntry {
    path: string;
    type: 'File' | 'Directory';
    buffer(): Promise<Buffer>;
  }
  export interface ZipDirectory {
    files: ZipEntry[];
  }
  export const Open: {
    buffer(buf: Buffer): Promise<ZipDirectory>;
    file(filePath: string): Promise<ZipDirectory>;
  };
}

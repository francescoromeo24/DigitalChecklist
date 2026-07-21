declare module 'read-excel-file/browser' {
  type Cell = string | number | boolean | Date | null;
  type Row = Cell[];
  interface SheetResult {
    sheet: string;
    data: Row[];
  }
  const readXlsxFile: (input: File | Blob) => Promise<SheetResult[]>;
  export default readXlsxFile;
}

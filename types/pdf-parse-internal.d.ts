declare module "pdf-parse/lib/pdf-parse.js" {
  const pdfParse: (input: Buffer) => Promise<{ text?: string }>;
  export default pdfParse;
}

declare module "word-extractor" {
  export default class WordExtractor {
    extract(inputPath: string): Promise<{
      getBody?: () => string;
      getText?: () => string;
    }>;
  }
}

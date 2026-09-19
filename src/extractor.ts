import type {
  BillingCode,
  CodeResult,
  JevResponse,
  ResultThresholds,
} from './codes.ts';

import catalogData from '../data/billing-codes.json' with { type: 'json' };
import { buildJevRequest, parseCatalog, readCodeResults } from './codes.ts';
import { askJev } from './typesafe.ts';

interface ExtractionResult {
  manualReview: CodeResult[];
  matches: CodeResult[];
  model: string;
  thresholds: ResultThresholds;
  usage: JevResponse['usage'];
}

interface ExtractorOptions {
  apiKey: string;
  catalog: readonly BillingCode[];
  model: string;
  thresholds: ResultThresholds;
}

type Extract = (dictation: string) => Promise<ExtractionResult>;

const loadCatalog = (): Promise<BillingCode[]> =>
  Promise.resolve(parseCatalog(catalogData));

const createExtractor =
  (options: ExtractorOptions): Extract =>
  async (dictation) => {
    const request = buildJevRequest(dictation, options.catalog, options.model);
    const response = await askJev(request, { apiKey: options.apiKey });
    const results = readCodeResults(
      response,
      options.catalog,
      options.thresholds,
    );
    return {
      manualReview: results.filter(
        ({ needsManualReview }) => needsManualReview,
      ),
      matches: results.filter(({ needsManualReview }) => !needsManualReview),
      model: response.model,
      thresholds: options.thresholds,
      usage: response.usage,
    };
  };

export type { Extract, ExtractionResult, ExtractorOptions };
export { createExtractor, loadCatalog };

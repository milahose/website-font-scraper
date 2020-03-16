/* eslint-env node, jest */
/**
 * Test suite for the font scraper.
 * Feel free to change, improve and add more tests!
 */
import Ajv from 'ajv';
import fetch from 'isomorphic-fetch';
import util, {promisify} from 'util';
import serveFontScraper from '../src/server';
import * as apiSchemas from '../src/apiSchemas';
import { response } from './testdata';
import {
  bfCrawl,
  dfCrawl,
  getPageFonts
} from '../src/scraper';

// ajv is a JSON Schema validator
const ajv = new Ajv({ allErrors: true });

const PORT = 3007;

let fontScraperServer;
beforeAll(async () => {
  jest.setTimeout(30000);
  fontScraperServer = await serveFontScraper({port: PORT});
});

afterAll(async () => {
  await promisify(
    fontScraperServer.close.bind(fontScraperServer)
  )();
});

async function parseFonts(body) {
  expect(body).toConformToSchema(apiSchemas.requestBody);
  const resp = await fetch(
    `http://localhost:${PORT}/parseFonts`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  return await resp.json();
}

describe("Public API conforms to specification", () => {
  test('Successful scrape response conforms to API specification', async () => {
    const data = await parseFonts({ url: 'http://news.ycombinator.com' });
    expect(data).toConformToSchema(apiSchemas.responseBody);
  });
  test('Failed scrape response conforms to API specification', async () => {
    const data = await parseFonts({ url: 'http://example.com/this-will-404' });
    expect(data).toConformToSchema(apiSchemas.responseBody);
  });
});

describe("Handles HTTP status codes correctly", () => {
  test('HTTP status codes >= 400 return response reason', async () => {
    const data = await parseFonts({ url: 'http://example.com/this-will-404'});
    const expected = {
      "ok": false,
      "reason": "Page responded with HTTP status 404"
    };
    expect(data).toEqual(expected);
  });
  test('HTTP status codes < 400 return website fonts', async () => {
    const data = await parseFonts({ url: 'https://github.com/'});
    const expected = response;
    expect(data).toEqual(expected);
  });
});

describe("Uses the correct search type", () => {
  test('Successfully performs a breadth-first search', async () => {
    const scraper = { bfCrawl };
    const bfCrawlSpy = jest.spyOn(scraper, 'bfCrawl').mockImplementation();
    scraper.bfCrawl();
    expect(bfCrawlSpy).toHaveBeenCalled();
  });
  test('Successfully performs a depth-first search', async () => {
    const scraper = { dfCrawl };
    const dfCrawlSpy = jest.spyOn(scraper, 'dfCrawl').mockImplementation();
    scraper.dfCrawl();
    expect(dfCrawlSpy).toHaveBeenCalled();
  });
  test('Successfully performs a default search', async () => {
    const scraper = { getPageFonts };
    const defaultCrawlSpy = jest.spyOn(scraper, 'getPageFonts').mockImplementation();
    scraper.getPageFonts();
    expect(defaultCrawlSpy).toHaveBeenCalled();
  });
});

expect.extend({
  toConformToSchema(data, schema) {
    const valid = ajv.validate(schema, data);
    return {
      pass: valid,
      message: () => valid
        ? 'Data conformed to schema'
        : this.utils.matcherHint('toConformToSchema', 'data', 'schema') +
          '\n\nData did not conform to schema. Validation errors:\n' +
          util.inspect(ajv.errors, {depth: 5})
    };
  }
});

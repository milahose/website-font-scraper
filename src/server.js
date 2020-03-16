// @flow
/**
 * The server for the font scraper.
 */
import express from 'express';
import axios from 'axios';
import {
  bfCrawl,
  dfCrawl,
  getPage,
  getPageFonts
} from './scraper';

export default async function serve({port}: { port: number }) {
  const app = express();
  app.use(express.json());

  app.post('/parseFonts', async (req, res, next) => {
    const seenFonts = {};
    const seenPages = {};
    const result = {
      ok: true,
      fontFamilies: [],
    };
    const {
      crawlRelative,
      pageLimit
    } = req.body;
    let { url } = req.body;
    const page = await getPage(url);

    if (!page.ok) {
      return res.json({
        ok: false,
        reason: `Page responded with HTTP status ${page.status}`,
      });
    }

    if (url[url.length - 1] === '/') {
      url = url.slice(0, -1);
    }

    // Determine crawl type and return response
    if (crawlRelative && crawlRelative === 'breadth-first') {
      await bfCrawl(url, pageLimit, seenPages, seenFonts, result, []);
      res.json(result);
    } else if (crawlRelative && crawlRelative === 'depth-first') {
      await dfCrawl(url, pageLimit, seenPages, seenFonts, result);
      res.json(result);
    } else {
      await getPageFonts(null, url, result, seenFonts);
      res.json(result);
    }
  });

  app.get('/100MostPopular', async (req, res, next) => {
    // API endpoints for Webflow Discover section
    const apis = [
      'https://webflow.com/api/discover/sites/popular?limit=20&offset=0&sort=-popularOn',
      'https://webflow.com/api/discover/sites/popular?limit=20&offset=20&sort=-popularOn',
      'https://webflow.com/api/discover/sites/popular?limit=20&offset=40&sort=-popularOn',
      'https://webflow.com/api/discover/sites/popular?limit=20&offset=60&sort=-popularOn',
      'https://webflow.com/api/discover/sites/popular?limit=20&offset=80&sort=-popularOn',
    ];
    const result = {
      ok: true,
      data: [],
    };

    try {
      for (const api of apis) {
        const response = await axios.get(api);
        response.data.forEach(obj => {
          // Choose some select data from most popular sites to send back
          const { title, description, author, thumbImg } = obj;
          result.data.push({
            title,
            author: author && (author.firstName && author.lastName) ? `${author.firstName} ${author.lastName}` : '',
            description,
            thumbImg,
          });
        });
      }
    } catch (err) {
      return res.json({
        ok: false,
        reason: err.message
      });
    }

    res.json(result);
  });

  return new Promise((resolve, reject) => {
    const _server = app.listen(port, err => {
      if (err) {
        reject(err);
        return;
      }
      console.log(`App listening on port ${port}.`);
      resolve(_server);
    });
  });
}

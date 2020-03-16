// @flow
import csstree from 'css-tree';
import axios from 'axios';
import jsdom from 'jsdom';

const getNumPageCharacters = characters => {
  if (characters && characters.length) {
    const whitespace = characters && characters.replace(/\s+/g, '').length;
    return (characters.length - whitespace);
  }
};

const getInlineFonts = (arr, seenFonts, result, document) => {
  const characterCount = getNumPageCharacters(document);
  return arr.reduce((seen, currentVal) => {
    if (currentVal && currentVal.startsWith('font-family')) {
      // Get all font-family styles and split on colon
      const font = currentVal.split(':')[1].trim();
      seen[font] = font;
      result.fontFamilies.push({ name: font, characterCount });
    }

    return seen;
  }, seenFonts);
};

const parseCSS = async (css, seenFonts, result) => {
  const ast = csstree.parse(css);
  const characterCount = getNumPageCharacters(css);
  csstree.walk(ast, function(node, item, list) {
    if (node.type === 'Declaration' && node.property === 'font-family' && list) {
      node.value.children.forEach(font => {
        // Remove extra quotation marks from around font values, if exist
        const fontValue = font.value ? font.value.replace(/['",]+/g, '').trim() : null;
        const fontName = font.name ? font.name.replace(/['",]+/g, '').trim() : null;

        // Fonts may be under value or name property
        if (fontValue && !seenFonts[fontValue]) {
          seenFonts[`${fontValue}`] = fontValue;
          result.fontFamilies.push({ name: fontValue, characterCount });
        }

        if (fontName && !seenFonts[fontName]) {
          seenFonts[`${fontName}`] = fontName;
          result.fontFamilies.push({ name: fontName, characterCount });
        }
      });
    }
  });
};

export const getPage = async (url: string) => {
  let response = null;
  try {
    response = await axios.get(url);
    return {
      ok: true,
      data: response.data,
    };
  } catch (err) {
    return {
      ok: false,
      status: err.response.status
    };
  }
};

const getPageLinks = document => {
  return Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href')).filter(href => {
    // Exclude duplicates to base url, locations on a page we already have and absolute urls
    return href && href !== '/' && href[0] !== '#' && !href.startsWith('http');
  });
};

const getDocument = async url => {
  const { JSDOM } = jsdom;
  const html = (await JSDOM.fromURL(url)).serialize();
  const { document } = (new JSDOM(html)).window;
  return document;
};

export const getPageFonts = async (document: null | { querySelectorAll: any, querySelector: any, ...}, url: string, result: { ok: boolean, fontFamilies: Array<{ name: string, characterCount: ?number}> }, seenFonts: { [string] : string }) => {
  // There won't be a document on default searches
  if (!document) {
    document = await getDocument(url);
  }

  // Grab inline styles, styles declared in <style> tags and stylesheets
  const styleTag = document.querySelector('style');
  const styleTagContent = styleTag ? document.querySelector('style').textContent : null;
  const inlineFonts = Array.from(document.querySelectorAll('*')).reduce((list, el) => {
    const style = el.getAttribute('style');
    if (style) { list.push(style); }
    return list;
  }, []);

  const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => link.getAttribute('href'));
  getInlineFonts(inlineFonts, seenFonts, result, JSON.stringify(document));

  if (stylesheets.length) {
    for (const href of stylesheets) {
      // Assume any urls that start with 'http' are not relative
      const path = href.startsWith('http') ? href : `${url}/${href}`;
      const response = await getPage(path);
      await parseCSS(response.data || null, seenFonts, result);
    }
  }

  if (styleTagContent) {
    await parseCSS(styleTagContent, seenFonts, result);
  }
};

export const bfCrawl = async (url: string, pageLimit: number, seenPages: { [string] : string }, seenFonts: { [string] : string }, result: { ok: boolean, fontFamilies: Array<{ name: string, characterCount: ?number}> }, queue: Array<string>) => {
  const document = await getDocument(url);
  pageLimit = pageLimit || 1;
  queue = queue || [];

  // Base case
  if (Object.values(seenPages).length === pageLimit) {
    return;
  }

  seenPages[url] = url;
  await getPageFonts(document, url, result, seenFonts);
  const pageLinks = getPageLinks(document);

  // Add new urls to queue
  if (pageLinks.length) {
    for (let i = 0; i < pageLinks.length; i++) {
      if (!seenPages[pageLinks[i]]) {
        queue.push(pageLinks[i]);
      }
    }
  }

  const nextLink = `${url}${queue.shift()}`;
  return bfCrawl(nextLink, pageLimit, seenPages, seenFonts, result, queue);
};

export const dfCrawl = async (url: string, pageLimit: number, seenPages: { [string] : string }, seenFonts: { [string] : string }, result: { ok: boolean, fontFamilies: Array<{ name: string, characterCount: ?number}> }) => {
  const document = await getDocument(url);
  const origin = (new URL(url)).origin;
  pageLimit = pageLimit || 1;

  // Base case
  if (Object.values(seenPages).length === pageLimit) {
    return;
  }

  seenPages[url] = url;
  await getPageFonts(document, url, result, seenFonts);
  const pageLinks = getPageLinks(document);
  const nextLink = `${origin}${pageLinks.shift()}`;

  // Visit next un-seen url
  if (pageLinks.length) {
    for (let i = 0; i < pageLinks.length; i++) {
      if (!seenPages[nextLink]) {
        return dfCrawl(nextLink, pageLimit, seenPages, seenFonts, result);
      }
    }
  } else {
    return;
  }
};

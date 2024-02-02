import { HLS } from './hls.js';
import axios from 'axios';

// import { httpRequest } from 'http-request';
// import { createResponse } from 'create-response';

const prefixes = JSON.parse('[{"pathPrefix":"/title-","queryPrefix":"ads.title"},{"pathPrefix":"/ptnr-","queryPrefix":"ads.partner"},{"pathPrefix":"/genre-","queryPrefix":"ads.content_genre"},{"pathPrefix":"/lang-","queryPrefix":"ads.lang"},{"pathPrefix":"/ctgr-","queryPrefix":"ads.ctgr"}]')

export async function responseProvider (request) {
    const path = request.path
    if(hasNoCustomPathParams(path) || isNotManifest(path)) return;

    const url = buildNormalUrl(request)
    let stage = 'initial', textManifest = 'pending'

    try{
        const response = await httpRequest(url, {headers: getSafeResponseHeaders(request.getHeaders())});
        stage = 'fetched response'
        textManifest = await response.text();
        stage = 'text manifest'
        if(textManifest && textManifest.trim().length > 0) {
          try{
            let manifest = HLS.parseManifest(textManifest);
            stage = 'process manifest'
            attatchPrefixes(manifest, request, url)
            stage = 'attach prefixes'
            textManifest = HLS.stringifyManifest(manifest)
          } catch (error) {
            stage = 'parse manifest failed'
          }
          stage = 'complete'
        } else {
          stage = 'skipped empty manifest'
        }
        return createResponse(
            response.status,
            getSafeResponseHeaders(response.getHeaders()),
            textManifest
        );
    } catch (error) {
        return createResponse(500, {}, "Got error for ("+url + "), stage: "+stage + ", TextManifest: "+ textManifest +"  Error: "+error.toString());
    }
}

export default async (req, res) => {
  const manifestUrl = req.body.playbackUrl

  const mUrl = new URL(manifestUrl)
  const path = mUrl.pathname
  // console.log(mUrl)
  if(hasNoCustomPathParams(path) || isNotManifest(path)) return;
  const request = {
    path: mUrl.pathname,
    scheme: mUrl.protocol.split(":")[0],
    host: mUrl.host,
    query: mUrl.search.replace('?', '')
  }
  const url = buildNormalUrl(request)

  let textManifest = await axios.get(url).then(response => {
      return response.data
  }).catch(error => console.log(error))

  let manifest = HLS.parseManifest(textManifest);
  attatchPrefixes(manifest, request, url)
  textManifest = HLS.stringifyManifest(manifest)

  res.status(200).send(textManifest);
};

function buildNormalUrl(request) {
  let mPath =request.path, cQueryArr = ['vg_cp=true']
  prefixes.forEach(prefix => {
    if(mPath.indexOf(prefix.pathPrefix) > -1) {
      const idx = mPath.indexOf(prefix.pathPrefix) + prefix.pathPrefix.length
      const value = mPath.substr(idx, mPath.substr(idx).indexOf('/'));
      mPath = mPath.replace(prefix.pathPrefix + value, '')
      cQueryArr.push(prefix.queryPrefix + "=" + value)
      prefix.value = value
    }
  });
  if(request.query && request.query.trim().length >0) cQueryArr.push(request.query.trim())
  return request.scheme+'://'+request.host+ mPath + (cQueryArr.length > 0 ? ('?'+cQueryArr.join('&')):'')
}

function isNotManifest(path) {
  return !path.endsWith('.m3u8')
}

function hasNoCustomPathParams(path) {
  return prefixes.filter(p => path.indexOf(p.pathPrefix) > -1).length == 0
}

function getSafeResponseHeaders(headers) {
    const UNSAFE_RESPONSE_HEADERS = ['content-length', 'transfer-encoding', 'connection', 'vary', 'accept-encoding', 'content-encoding', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade', 'host'];
    for (let unsafeResponseHeader of UNSAFE_RESPONSE_HEADERS) {
        if (unsafeResponseHeader in headers) {
            delete headers[unsafeResponseHeader];
        }
    }
    return headers;
}

function attatchPrefixes(playlistObj, request, originUrl) {
  const prefixWithValues = prefixes.filter(e => e.value != undefined)
  if(prefixWithValues.length == 0) return

  /**
   * Attaches partner and other custom params from path as query params to child manifests and segments
   */
  const originUrlQuery = originUrl.split('?')[1]
  const attachCustomParamsAsQueryOnly = function(url) {
    if(url.startsWith("http")) return url + (url.indexOf('?')> -1 ? '&' : '?') + originUrlQuery

    const originSplit = originUrl.split('?')
    const urlSplit = originSplit[0].split('/')
    const routedSplit = url.split('/').map(e => e.split("?")[0])
    urlSplit.pop()
    routedSplit.filter(e => e==='..').forEach(e => urlSplit.pop())
    const queryArr = []
    if(url.split('?').length > 1) queryArr.push(url.split('?')[1])
    if(originUrlQuery && originUrlQuery.trim().length > 0) queryArr.push(originUrlQuery.trim())
    return urlSplit.concat(routedSplit.filter(e => e != '..')).join('/') + (queryArr.length > 0 ? '?'+queryArr.join('&'): '')
  }


  /**
   * Attaches partner and other custom params as query string for segments and different domains
   * For manifests on same domain attaches prefix of custom params for futher processing
   */
  const pathPrefix = prefixWithValues.map(prefix =>  prefix.pathPrefix + prefix.value).join('')
  const queryPrefix = prefixWithValues.map(prefix => prefix.queryPrefix + '=' + prefix.value).join('&')
  const dotsPrefix = prefixWithValues.map(p => "..").join("/")+(prefixWithValues.length>0?'/':'')
  const normalPathPrefix = "/"+originUrl.split("?")[0].split("://")[1].split("/").slice(0,-1).slice(1).join("/")
  const attachCustomParams = function(url) {
    const isManifest = url.includes('.m3u8')
    if(!isManifest && originUrl.indexOf("ads.title=Shemaroo_Bollywood&ads.partner=distrotv") === -1) return attachCustomParamsAsQueryOnly(url)
    if(isManifest === true) {
      if(url.startsWith('../')) return url
      if(url.startsWith("/")) return pathPrefix + url
      if(url.startsWith('http')) {
        const isSameDomain = url.startsWith(request.scheme+'://'+request.host+'/')
        if(isSameDomain) return url.replace(request.host, request.host + pathPrefix)
        return url + (url.indexOf('?')> -1 ? '&' : '?') + queryPrefix
      }
      return url
    } else {
      if(url.startsWith('../')) return dotsPrefix + url + (url.indexOf('?')> -1 ? '&' : '?') + queryPrefix
      if(url.startsWith("/")) return url + (url.indexOf('?')> -1 ? '&' : '?') + queryPrefix
      if(url.startsWith('http')) return url + (url.indexOf('?')> -1 ? '&' : '?') + queryPrefix
      return normalPathPrefix + '/' + url + (url.indexOf('?')> -1 ? '&' : '?') + queryPrefix
    }
  }

  playlistObj.segments && playlistObj.segments.forEach(ele => ele.uri = attachCustomParams(ele.uri))
  playlistObj.variants && playlistObj.variants.forEach(ele => ele.uri = attachCustomParams(ele.uri))

  // playlistObj.segments && playlistObj.segments.forEach(ele => ele.uri = attachCustomParamsAsQueryOnly(ele.uri))
  // playlistObj.variants && playlistObj.variants.forEach(ele => ele.uri = attachCustomParamsAsQueryOnly(ele.uri))
  return !0;
}
// Import logging module
import { HLS } from './hls.js';
// import { httpRequest } from 'http-request';
// import { createResponse } from 'create-response';

export async function responseProvider (request) {
  const response = await httpRequest(request.url, {headers: getSafeResponseHeaders(request.getHeaders())});
  let textManifest = await response.text();
  try{
        
        let videoHeightQuery = request.query.split('&').find(q => q.startsWith('aws.manifestfilter='))
        if(videoHeightQuery !== undefined) {
            videoHeightQuery = videoHeightQuery.replace('aws.manifestfilter=', '')
            textManifest = singleBitrate(textManifest, videoHeightQuery)
        }
        return createResponse(
            response.status,
            getSafeResponseHeaders(response.getHeaders()),
            textManifest
        );
    } catch (error) {
        return createResponse(
            response.status,
            getSafeResponseHeaders(response.getHeaders()),
            textManifest
        );
    }
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

function singleBitrate(textManifest, allowedVideoHeight) {
    try {
        if(allowedVideoHeight === undefined) return textManifest
        const heightRange = allowedVideoHeight.replace('video_height:', '').split('-')
        const minHeight = parseInt(heightRange[0]), maxHeight = parseInt(heightRange[1])
        let manifestLines = textManifest.split('\n')
   
        const manifest = HLS.parseManifest(textManifest)
        const removeVariants = manifest.variants.filter(variant => variant.isIFrameOnly === false &&( parseInt(variant.resolution.height) < minHeight || parseInt(variant.resolution.height) > maxHeight))
                                .map(v => {return {uri: v.uri, res: v.resolution.width+'x'+v.resolution.height}})
        manifestLines = manifestLines.filter(line => {
            if(line.startsWith('#EXT-X-STREAM-INF:CODECS=')) {
                return removeVariants.map(v => v.res).find(res => line.indexOf(res)>-1) === undefined
            } 
            return line.startsWith('#') || !removeVariants.map(v => v.uri).includes(line)
        })
        return manifestLines.join('\n')
    } catch(e) {
        console.log(e)
        return textManifest;
    }
}

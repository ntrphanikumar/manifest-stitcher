import axios from 'axios';

const HLS = require('hls-parser');

export default async (req, res) => {
    const payload = req.body
    validate(payload)
    res.status(200).json({message: 'Validation initiated'});
};

function fullUri(parentUrl, uri) {
    const mUrl = new URL(parentUrl)
    const mPrefix = mUrl.origin + mUrl.pathname.replace(mUrl.pathname.split("/").slice(-1)[0], '')
    let fUrl = (uri.startsWith("/"))?mUrl:(uri.startsWith("http")?'':mPrefix)+uri
    return fUrl
}

async function downloadChildManifests(variants, payload) {
    const result = await Promise.all(variants.map(v => downloadManifest(fullUri(payload.playbackUrl, v.uri), payload)))
    const failure = result.map((r,idx) => {
        r.uri = fullUri(payload.playbackUrl, variants[idx].uri)
        return r
    }).filter(r => r.failed === true).reduce((a,b)=>{
        return {
            failed: true,
            url: [a.url, b.url],
            reason: a.reason+","+b.reason
        }
    }, {})
    if(failure && failure.failed === true) return failure
    else return result
}

async function downloadManifest(url, payload) {
    try {
        console.log(url)
        return await axios.get(url).then(async response => {
            return HLS.parse(response.data)
        }).catch(e => {
            return error(url, e.toString(), payload)
        })
    } catch(e) {
        return error(url, e.toString(), payload)
    }
}

function validateDuration(manifest, payload) {
    const duration = Math.round(manifest.segments.map(s => s.duration).reduce((a, b) => a+b, 0))
    if(duration < payload.minDurationInSecs || duration > payload.maxDurationInSecs) return {
        ...error(payload.playbackUrl, `Duration is not within accepted range of ${payload.minDurationInSecs} secs to ${payload.maxDurationInSecs} secs.`, payload),
        ... {
            duration: duration
        }
    }
}

async function validateChunks(manifest, payload) {
    async function downloadChunk(segment) {
        const chunkUrl = fullUri(manifest.uri || payload.playbackUrl, segment.uri)
        console.log(chunkUrl)
        return await axios.get(chunkUrl).then(async response => {
            return {url: segment.uri, failed: false}
        }).catch(e => {
            return error(segment.uri, e.toString(), payload)
        })
    }

    const groupedSegments = manifest.segments.reduce((resultArray, item, index) => { 
        const chunkIndex = Math.floor(index/25)
        if(!resultArray[chunkIndex])  resultArray[chunkIndex] = []
        resultArray[chunkIndex].push(item)
        return resultArray
    }, [])

    let gsResult = []
    for(var idx=0;idx<groupedSegments.length;idx++) {
        gsResult[idx] = (await Promise.all(groupedSegments[idx].map(s => downloadChunk(s)))).filter(r => r.failed === true).reduce(reduceR, {})
    }
    const result = gsResult.filter(r => r.failed === true).reduce(reduceA, {});
    if(result.failed === true) return result
}

function error(url, reason, payload) {
    return {
        failed: true,
        failedUrl: url,
        reason: reason,
        playbackUrl: payload.playbackUrl
    }
}

function reduceR(a,b) {
    b.reason = (a.reason || []).concat([{url: b.failedUrl, reason: b.reason}])
    b.failedUrl = (a.failedUrl || []).concat([b.failedUrl])
    return b
}

function reduceA(a,b) {
    b.reason = (a.reason || []).concat(b.reason)
    b.failedUrl = (a.failedUrl || []).concat(a.failedUrl)
    return b
}

async function validate(payload) {
    const result = (await async function() {
        try {
            const mainManifest = await downloadManifest(payload.playbackUrl, payload)
            if(mainManifest.error === true)  return error(payload.playbackUrl, mainManifest.reason, payload)
            if(mainManifest.isMasterPlaylist) {
                const childManifests = await downloadChildManifests(mainManifest.variants.filter(v => !v.isIFrameOnly), payload)
                if(childManifests.failed === true) return childManifests
                const durationFailed = validateDuration(childManifests[0], payload)
                if(durationFailed) return durationFailed
                if(payload.validateChunks) {
                    const result = (await Promise.all(childManifests.map(m => validateChunks(m, payload)))).filter(r => r !== undefined).reduce(reduceA, {})
                    if(result.failed === true) return result
                }
            } else if(payload.validateChunks) return await validateChunks(manifest, payload)
        } catch (e){
            return error(payload.playbackUrl, e.toString(), payload)
        }
    }() || {
        failed: false,
        playbackUrl: payload.playbackUrl
    })
    axios.post(payload.callback.post_url, JSON.stringify(result), {headers: {'Authorization': payload.callback.AuthHeader}})
        .then(response => {console.log(response.status, result)}).catch(error => {console.log(error.message, result)})
}
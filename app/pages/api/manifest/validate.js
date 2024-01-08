import axios from 'axios';

const HLS = require('hls-parser');

export default async (req, res) => {
    const payload = req.body
    validate(payload)
    res.status(200).json({message: 'Validation initiated'});
};

function fullUri(parentUrl, uri, isSegment) {
    const mUrl = new URL(parentUrl)
    const mPrefix = mUrl.origin + mUrl.pathname.replace(mUrl.pathname.split("/").slice(-1)[0], '')
    let fUrl = (uri.startsWith("/"))?mUrl:(uri.startsWith("http")?'':mPrefix)+uri
    if(isSegment && process.env.SEGMENTS_HOST) {
        fUrl = new URL(fUrl)
        return process.env.SEGMENTS_HOST+fUrl.pathname+fUrl.search
    } else return fUrl
}

async function downloadChildManifests(variants, payload) {
    const result = await Promise.all(variants.map(v => downloadManifest(fullUri(payload.playbackUrl, v.uri), payload)))
    const failure = result.map((r,idx) => {
        if(r.error) r.uri = variants[idx].uri
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
        }).catch(error => {
            return error(url, error.toString(), payload)
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
    return 
}

function error(url, reason, payload) {
    return {
        failed: true,
        failedUrl: url,
        reason: reason,
        playbackUrl: payload.playbackUrl,
        chunksValidated: false
    }
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
                    const result = await Promise.all(childManifests.map(m => validateChunks(m, payload)))
                    console.log(result)
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
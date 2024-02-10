import axios from 'axios';

const HLS = require('hls-parser');

export default async (req, res) => {
    const payload = req.body
    warm(payload.playbackUrl)
    res.status(200).json({message: 'Validation initiated'});
};

function fullUri(parentUrl, uri) {
    const mUrl = new URL(parentUrl)
    const mPrefix = mUrl.origin + mUrl.pathname.replace(mUrl.pathname.split("/").slice(-1)[0], '')
    let fUrl = (uri.startsWith("/"))?mUrl:(uri.startsWith("http")?'':mPrefix)+uri
    return fUrl
}

async function downloadManifest(url) {
    try {
        return await axios.get(url).then(async response => {
            return HLS.parse(response.data)
        }).catch(e => {
            return error(url, e.toString())
        })
    } catch(e) {
        return error(url, e.toString())
    }
}

function error(url, reason) {
    return {
        failed: true,
        failedUrl: url,
        reason: reason
    }
}

export async function warm(playbackUrl) {
    const mainManifest = await downloadManifest(playbackUrl)
    if(mainManifest.failed === true) throw mainManifest
    const childManifestUrls = mainManifest.isMasterPlaylist ? mainManifest.variants.filter(v => !v.isIFrameOnly).map(v => fullUri(playbackUrl, v.uri)) : [playbackUrl]
    const segDur = await warmSegments(childManifestUrls)
    setInterval(async function(){warmSegments(childManifestUrls)}, segDur*1000)
}

async function warmSegments(childManifestUrls) {
    return (await Promise.all(await childManifestUrls.map(async url => {
        const manifest = await downloadManifest(url)
        console.log(fullUri(url,manifest.segments[0].uri))
        manifest.failed === true ? {} : await axios.get(fullUri(url, manifest.segments[0].uri))
        return manifest.failed === true ? 6 : parseInt(manifest.segments[0].duration)
    }))).reduce(function(a,b){return Math.min(a,b)}, 100);
}
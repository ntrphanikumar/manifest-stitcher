import axios from 'axios';

const HLS = require('hls-parser');

export default async (req, res) => {
    const payload = req.body
    const channel = 54
    const start = 1509448
    const end = 1551880
    // const end = 1511880
    const epgIds = Array.from({length: end-start+1}, (x, i) => i+start).reduce((resultArray, item, index) => { 
        const chunkIndex = Math.floor(index/1000)
        if(!resultArray[chunkIndex])  resultArray[chunkIndex] = []
        resultArray[chunkIndex].push(item)
        return resultArray
    }, []);
    console.log(epgIds)

    const result = []
    for(var idx =0 ;idx<epgIds.length;idx++) {
        result.push({
            rangeIdx: idx,
            result: (await Promise.all(epgIds[idx].map(epgid => `https://d3e44333nfcy2o.cloudfront.net/vod/ss/prod/${channel}/${epgid}__prod/index.m3u8`).map(async s => await sequence(s))))
            .filter(r => r.failed === undefined || !r.reason.includes('status code 403')).filter(r => r.failed === true || r.seq.length > 1)
        })
    }

    // const result = await sequence("https://d3e44333nfcy2o.cloudfront.net/vod/ss/prod/54/1509452__prod/index.m3u8")

    
    res.status(200).json(result.map(r=>r.result).flat(1));
};

async function sequence(parentUrl) {
    try {
        const manifest = await downloadManifest(parentUrl)
        if(manifest.failed === true) return {...manifest, ...{mainManifestFailed: true}}
        const childManifests = manifest.variants.filter(v=>!v.isIFrameOnly).map(v => v.uri).concat(manifest.source.split('\n').filter(p => p.startsWith('#EXT-X-IMAGE-STREAM-INF')).map(e => e.split('URI=')[1].split("\"")[1]))
        return (await Promise.all(childManifests.map(v => downloadManifest(fullUri(parentUrl, v))))).map((m, idx) => {
            return {
                uri: childManifests[idx],
                seq: m.mediaSequenceBase
            }
        }).reduce((a,b)=> {
            a[b.seq] = (a[b.seq] || []).concat([b.uri])
            a.seq = a.seq.includes(b.seq)?a.seq:a.seq.concat([b.seq])
            return a
        }, {url: parentUrl, seq: []})    
    } catch (e) {
        return error(parentUrl, e.toString())
    }
}

function fullUri(parentUrl, uri) {
    const mUrl = new URL(parentUrl)
    const mPrefix = mUrl.origin + mUrl.pathname.replace(mUrl.pathname.split("/").slice(-1)[0], '')
    let fUrl = (uri.startsWith("/"))?mUrl:(uri.startsWith("http")?'':mPrefix)+uri
    return fUrl
}

async function downloadManifest(url) {
    console.log(url)
    return await axios.get(url).then(async response => {
        return HLS.parse(response.data)
    }).catch(e => {
        return error(url, e.toString())
    })
}

function error(url, reason) {
    return {
        failed: true,
        url: url,
        reason: reason,
    }
}
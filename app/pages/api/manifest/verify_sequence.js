import axios from 'axios';

const HLS = require('hls-parser');

const fs = require('fs');
const dir = __dirname

export default async (req, res) => {
    const { channel, start, end, playbackUrlPattern, channelStart, channelEnd, writeToFile } = req.body

    let channelIds = []
    if(channelStart !== undefined && channelEnd !== undefined) channelIds = range(channelStart, channelEnd).flat(1)
    else if(channel !== undefined) channelIds = [channel]
    else res.start(400).json({reason: 'Channel or range not specified'})

    // console.log(channelIds)

    const finalResult = {}
    for(var idx =0; idx < channelIds.length;idx++) {
        const result = await channelResult(channelIds[idx], start, end, playbackUrlPattern)
        if(writeToFile){
            fs.writeFile(`${dir}/${channelIds[idx]}.json`, JSON.stringify(result), err => {
            if (err) {
                console.error(err);
            }
            });
        } else {
            finalResult[channelIds[idx]] = result
        }
    }

    res.status(200).json(finalResult);
};

function range(start, end) {
    return Array.from({length: end-start+1}, (x, i) => i+start).reduce((resultArray, item, index) => { 
        const chunkIndex = Math.floor(index/1000)
        if(!resultArray[chunkIndex])  resultArray[chunkIndex] = []
        resultArray[chunkIndex].push(item)
        return resultArray
    }, []);
}

async function channelResult(channel, start, end, playbackUrlPattern) {
    const epgIds = range(start, end)

    const result = []
    for(var idx =0 ;idx<epgIds.length;idx++) {
        result.push({
            rangeIdx: idx,
            result: (await Promise.all(epgIds[idx].map(epgid => playbackUrlPattern.replace('${channel}', channel).replace('${epgid}',epgid)).map(async s => await sequence(s))))
            .filter(r => r.failed === undefined || !r.reason.includes('status code 403')).filter(r => r.failed === true || r.seq.length > 1)
        })
    }
    return result.map(r=>r.result).flat(1)
}

async function sequence(parentUrl) {
    try {
        const manifest = await downloadManifest(parentUrl)
        if(manifest.failed === true) return {...manifest, ...{mainManifestFailed: true}}
        const childManifests = manifest.variants.filter(v=>!v.isIFrameOnly).map(v => v.uri).concat(manifest.source.split('\n').filter(p => p.startsWith('#EXT-X-IMAGE-STREAM-INF')).map(e => e.split('URI=')[1].split("\"")[1]))
        return (await Promise.all(childManifests.map(v => downloadManifest(fullUri(parentUrl, v))))).map((m, idx) => {
            return {
                uri: {uri:childManifests[idx], segments: m.segments.length, firstSeg: m.segments[0].uri, lastSeg: m.segments.slice(-1)[0].uri},
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
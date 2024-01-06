import axios from 'axios';


const HLS = require('hls-parser');

export const channelPlaylist = {}

export const fetchPlaylist = async (channel) => {
    const curatedPlaylist = await downloadPlaylist(channel)
    channelPlaylist[channel] = flatten(curatedPlaylist? await Promise.all(curatedPlaylist.map(item => downloadManifest(item))): {})
    console.log(new Date(), channel, `Downloaded latest playlist with endtime ${new Date(channelPlaylist[channel].endtime)}`)
    return channelPlaylist[channel]
}

async function processMasterManifest(item, manifest, manifestUrl) {
    const variants = manifest.variants.filter(v => !v.isIFrameOnly).filter(v => v.uri.includes('.m3u8')).map(v => {
        return {uri: fullUri(manifestUrl, v.uri), width: v.resolution.width, height: v.resolution.height}
    })
    const startTime = item.startEPOC
    const flatManifest = {
        starttime: startTime,
        widths: variants.map(e => e.width),
        contents: {}
    }

    const result = await Promise.all(variants.map(v => downloadManifest(item, v.uri)))
    for (var i = 0; i < flatManifest.widths.length; i++) {
        flatManifest.contents[flatManifest.widths[i]] = result[i]
    }
    flatManifest.duration = Math.round(flatManifest.contents[variants[0].width].map(e => e.duration).reduce((a,b)=>a+b))
    flatManifest.endtime = startTime + flatManifest.duration
    return flatManifest
}

async function processChildManifest(item, manifest, manifestUrl) {
    let start = item.startEPOC, end = item.starEPOC, currenttime = new Date().getTime()
    const segments = manifest.segments
    const segmentLength = segments[0].duration
    const startSegToSkip = parseInt(item.seekstartSecs/segmentLength)
    const segmentsToPick = parseInt((item.seekendSecs-item.seekstartSecs)/segmentLength)

    const segment = (seg, start, end) => {
        return {
            uri: fullUri(manifestUrl, seg.uri),
            duration: seg.duration*1000,
            starttime: start,
            endtime: end
        }
    }

    const skipOldAndFarFutureSegments = (s) => {
        if(s.endtime > item.endEPOC) {
            return s.starttime < item.endEPOC
        } else if(s.endtime <= item.endEPOC && s.endtime> item.starEPOC) {
            return true
        }
        return false 
    }

    const CONTENT_END = { uri: 'CONTENT_END', duration: 0, starttime: item.endEPOC, endtime: item.endEPOC}
    return segments.slice(startSegToSkip,startSegToSkip+segmentsToPick).map(s => {
        start = end
        end = Math.round(start + s.duration*1000)
        return segment(s, start, end)
    }).filter(skipOldAndFarFutureSegments).concat([CONTENT_END])
}

function fullUri(parentUrl, uri) {
    const mUrl = new URL(parentUrl)
    const mPrefix = mUrl.origin + mUrl.pathname.replace(mUrl.pathname.split("/").slice(-1)[0], '')
    return (uri.startsWith("/"))?mUrl:(uri.startsWith("http")?'':mPrefix)+uri
}

async function downloadManifest(item, subUrl) {
    const manifestUrl = subUrl || item.playbackUrl
    return await axios.get(manifestUrl).then(async response => {
        const manifest = HLS.parse(response.data)
        return (manifest.isMasterPlaylist? processMasterManifest: processChildManifest)(item, manifest, manifestUrl)
    }).catch(error => {
        console.error(error)
        return undefined
    })
}

async function downloadPlaylist(channel) {
    const FormData = require('form-data');
    let data = new FormData();
    data.append('cid', channel);
    data.append('limit', 3);
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://cpapi1.janya.video/v4/playout/getpplitemsprod',
        headers: { 
          'X-Auth-Token': '25480b32-29bf-4783-8ecf-ba52fe5d4b0c'
        },
        data : data
    };
    return await axios.request(config).then((response) => normalizePlaylist(response.data)).catch((error) => undefined);
}

function normalizePlaylist(playlist) {
    return playlist.PPlItems.map(item => {
        item.starEPOC = item.starttime/item.fps * 1000
        item.endEPOC = item.endtime/item.fps * 1000
        item.duration = item.segduration/item.fps * 1000
        item.seekstartSecs = Math.round(item.seekstart/item.fps)
        item.seekendSecs = Math.round(item.seekend/item.fps)
        return item
    })
}

function flatten(playlist) {
    const widthsSupported = [...new Set(playlist.map(p => p.widths).flat(1))].sort((a,b)=>parseInt(a)-parseInt(b))
    const flatData = {
        contents: {}
    }
    for(var idx=0; idx < widthsSupported.length; idx++) {
        const width = widthsSupported[idx]
        flatData.contents[width] = playlist.map(p => p.contents[width] || p.contents[Math.max(...p.widths.filter(w => w <= width))]).flat(1)
    }
    flatData.starttime = flatData.contents[widthsSupported[0]][0].starttime
    flatData.endtime = Math.max(...flatData.contents[widthsSupported[0]].map(e => e.endtime))
    return flatData
}
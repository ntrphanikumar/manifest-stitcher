import axios from 'axios';


const HLS = require('hls-parser');

export const channelPlaylist = {}

// export default async (req,res)=>{
//     const channel = '132'
//     if(channelPlaylist[channel] === undefined || channelPlaylist[channel][channelPlaylist[channel].length-1].endtime < new Date().getTime()+300000) 
//         fetchPlaylist(channel)
//     res.status(200).json(channelPlaylist[channel]);
// }

export const fetchPlaylist = async (channel) => {
    const curatedPlaylist = await downloadPlaylist(channel)
    channelPlaylist[channel] = flatten(curatedPlaylist? await Promise.all(curatedPlaylist.map(item => downloadManifest(item))): {})
    console.log(new Date(), channel, `Downloaded latest playlist with endtime ${new Date(channelPlaylist[channel].endtime)}`)
    return channelPlaylist[channel]
}

function fullUri(parentUrl, uri) {
    const mUrl = new URL(parentUrl)
    const msplit = mUrl.pathname.split("/")
    const mPrefix = mUrl.origin+mUrl.pathname.replace(msplit[msplit.length-1], '')
    let vuri = uri
    if(vuri.startsWith("http")) {

    } else if (vuri.startsWith("/")) {
        vuri = mUrl.origin+vuri
    } else {
        vuri = mPrefix+vuri
    }
    return vuri
}

const downloadManifest = async (item, subUrl) => {
    const manifestUrl = subUrl || item.playbackUrl
    const startTime = item.starEPOC
    return await axios.get(manifestUrl).then(async response => {
        const manifest = HLS.parse(response.data)
        if(manifest.isMasterPlaylist) {
            const variants = manifest.variants.filter(v => !v.isIFrameOnly).filter(v => v.uri.includes('.m3u8')).map(v => {
                return {uri: fullUri(manifestUrl, v.uri), width: v.resolution.width, height: v.resolution.height}
            })
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
        } else {
            let start = startTime, end = startTime, currenttime = new Date().getTime()
            const segments = manifest.segments
            const startSegToSkip = parseInt(item.seekstartSecs/6)
            const segmentsToPick = parseInt((item.seekendSecs-item.seekstartSecs)/6)

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
    }).catch(error => {
        console.error(error)
        return undefined
    })
}

const downloadPlaylist = async (channel) => {
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

const normalizePlaylist = (playlist) => {
    const currenttime = new Date().getTime()
    const modPlaylist = playlist.PPlItems
    modPlaylist.forEach(item => {
        item.starEPOC = item.starttime/item.fps * 1000
        item.endEPOC = item.endtime/item.fps * 1000
        item.duration = item.segduration/item.fps * 1000
        item.seekstartSecs = Math.round(item.seekstart/item.fps)
        item.seekendSecs = Math.round(item.seekend/item.fps)
    })
    // const filteredItems = (modPlaylist[0].endEPOC - currenttime) > 600000 ? [modPlaylist[0]] : modPlaylist.filter(item => (item.endEPOC - currenttime) <= 600000)
    // return filteredItems
    return modPlaylist
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
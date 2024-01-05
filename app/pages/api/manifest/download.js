import axios from 'axios';


const HLS = require('hls-parser');

const channelPlaylist = {}

export default async (req,res)=>{
    const channel = '132'
    const curatedPlaylist = await downloadPlaylist(channel)
    const result = curatedPlaylist? await Promise.all(curatedPlaylist.map(item => downloadManifest(item.playbackUrl, item.starEPOC))): {}
    res.status(200).json(result);
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

const downloadManifest = async (manifestUrl, startTime) => {
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
            for (var i = 0; i < variants.length; i++) {
                flatManifest.contents[variants[i].width] = await downloadManifest(variants[i].uri, startTime)
            }
            flatManifest.duration = Math.round(flatManifest.contents[variants[0].width].map(e => e.duration).reduce((a,b)=>a+b))*1000
            flatManifest.endtime = startTime + flatManifest.duration
            return flatManifest
        } else {
            let start = startTime, end = startTime
            return manifest.segments.map(s => {
                start = end
                end = Math.round(start + s.duration*1000)
                return {
                    uri: fullUri(manifestUrl, s.uri),
                    duration: s.duration*1000,
                    starttime: start,
                    endtime: end
                }
            })
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
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://cpapi1.janya.video/v3/playout/getpplitemsprod',
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
    })
    const filteredItems = (modPlaylist[0].endEPOC - currenttime > 600000) ? [modPlaylist[0]] : modPlaylist.filter(item => (item.endEPOC - currenttime) <= 600000)
    filteredItems.forEach(item => {
        console.log(item.playbackUrl)
    })
    return filteredItems
}
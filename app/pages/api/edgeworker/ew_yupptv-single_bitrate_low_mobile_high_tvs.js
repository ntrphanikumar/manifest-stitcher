import axios from 'axios';
import { HLS } from './hls.js';

export default async (req, res) => {
    const manifestUrl = req.body.playbackUrl
    const isMobile = req.body.isMobile
    const textmanifest = await axios.get(manifestUrl).then(response => {
        return response.data
    }).catch(error => console.log(error))
	res.status(200).send(singleBitrate(textmanifest, isMobile));
};


function singleBitrate(textManifest, isMobile) {
    try {
        const manifest = HLS.parseManifest(textManifest)
        if(!manifest.isMasterPlaylist) return textManifest
        const variants = manifest.variants.filter(variant => variant.isIFrameOnly === false).map(v => {
            return {
                width: v.resolution.width,
                res: v.resolution.width+'x'+v.resolution.height,
                uri: v.uri
            }
        }).sort((a,b) => a.width - b.width)
        let manifestLines = textManifest.split('\n')
        let removeVariants = []
        if(isMobile === undefined) return textManifest
        if(isMobile === true || isMobile === "true") {
            removeVariants = variants.slice(1)
        } else {
            removeVariants = variants.slice(0, variants.length -1)
        }
        manifestLines = manifestLines.filter(line => {
            if(line.startsWith('#EXT-X-STREAM-INF:')) {
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
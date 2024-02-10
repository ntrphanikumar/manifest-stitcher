import axios from 'axios';
const fs = require('fs');
const {resolve} = require('path');

const HLS = require('hls-parser');
export default async function handler(req, res) {
    enableCors(action)(req, res)
}

const enableCors = fn => async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*') // replace this your actual origin
    res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,PATCH,POST,PUT')
    res.setHeader( 'Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')
    // specific logic for the preflight request
    if (req.method === 'OPTIONS') {
      res.status(200).end()
      return
    }
    return await fn(req, res)
}

const action = async (req, res) => {
    let { playbackUrl, isSchedule, schedule, custom } = req.body
    if(playbackUrl === undefined || isSchedule === undefined || (isSchedule === true && schedule === undefined) || (isSchedule === false && custom === undefined)) {
        res.status(400).send({message: "Invalid payload"})
        return
    }
    const manifest = await downloadManifest(playbackUrl)
    const output_dir = scteDir()
    if(manifest.isMasterPlaylist) {
        let scte_master = manifest.source
        manifest.variants.forEach(variant => scte_master = scte_master.replace(variant.uri, variant.uri.replace('.m3u8','_scte.m3u8')));
        const masterfile = new URL(playbackUrl).pathname.split('/').slice(-1)[0].split('?')[0].replace('.m3u8', '_scte.m3u8')
        fs.writeFileSync(output_dir+'/'+masterfile, scte_master);
        const s3Prefix = new URL(playbackUrl).pathname.split('/').slice(0, -1).filter(s => s !== '').join('/')
        const files2Upload = await Promise.all(manifest.variants.map(async variant => {
            const variantFullUri = fullUri(playbackUrl, variant.uri)
            const childManifest = await downloadManifest(variantFullUri)
            return await processChildManifest(childManifest, isSchedule, schedule, custom, s3Prefix, output_dir, variant.uri)
        }))
        files2Upload.push({file: resolve(output_dir)+'/'+masterfile, s3Key: s3Prefix+'/'+masterfile})
        await Promise.all(files2Upload.map(e => uploadToS3(e.file, e.s3Key)))

        try {
            files2Upload.forEach(e => fs.rmSync(e.file))
            fs.rmdirSync(output_dir)
        } catch(e) {
            console.log('Failed to cleanup', e)
        }
        
        res.status(200).send(files2Upload)
        return
    }
    res.status(200).send(req.body)
}

async function processChildManifest(manifest, isSchedule, schedule, custom, s3Prefix, output_dir, vuri) {
    const segmap = getSegmap(manifest)
    const insertionPoints = isSchedule? function(){
        const totalLength = segmap[segmap.length-1].elapsed
        const newCustom = Array.from({length: segmap.length}, (x, i) => i).map(s => s * schedule.insertEverySecs)
        .filter(s => s <= totalLength && s > 0).map(s => {return {"insertAtSec": s,"insertDurationInSecs": schedule.insertDurationInSecs}})
        return newCustom
    }() : custom
    const insertAfter = []    
    for(let segMapIdx =0, insertionPointIdx =0;segMapIdx < segmap.length && insertionPointIdx < insertionPoints.length;segMapIdx++) {
        if(segmap[segMapIdx].elapsed > insertionPoints[insertionPointIdx].insertAtSec) {
            if(segMapIdx > 0) {
                insertAfter.push({uri: segmap[segMapIdx-1].uri, dur: insertionPoints[insertionPointIdx].insertDurationInSecs})
            }
            insertionPointIdx++
        }
    }
    let source = manifest.source
    insertAfter.forEach(e => source =  source.replace(e.uri, e.uri+'\n#EXT-X-CUE-OUT:'+e.dur+'\n#EXT-X-CUE-IN'))
    const file = resolve(output_dir)+'/'+vuri.replace('.m3u8','_scte.m3u8').split('?')[0].split('/').slice(-1)
    fs.writeFileSync(file, source);
    return {file: file, s3Key: s3Prefix+'/'+vuri.replace('.m3u8','_scte.m3u8').split('?')[0]}
}

function getSegmap(manifest) {
    let elapsed = 0
    return manifest.segments.map(segment => {
        const res = {
            uri: segment.uri,
            elapsed: elapsed
        }
        elapsed += segment.duration
        return res
    })
}

function scteDir() {
    try {
        const scte_manifest_dir = new Date().getTime()+''
        fs.mkdirSync(scte_manifest_dir)
        return scte_manifest_dir
    } catch (err) {
        console.error(err);
    }
}

function fullUri(parentUrl, uri) {
    const mUrl = new URL(parentUrl)
    const mPrefix = mUrl.origin + mUrl.pathname.replace(mUrl.pathname.split("/").slice(-1)[0], '')
    return (uri.startsWith("/"))?mUrl:(uri.startsWith("http")?'':mPrefix)+uri
}

async function downloadManifest(playbackUrl) {
    return axios.get(playbackUrl).then(response => {
        return HLS.parse(response.data)
    }).catch(error => {
        console.log(error)
        return 
    })
}

const { Upload } = require("@aws-sdk/lib-storage");
const { S3Client } = require("@aws-sdk/client-s3");
async function uploadToS3(thumbnail_file, s3StorageKey) {
  try {
    return new Upload({
      client: new S3Client({
          credentials: {
              accessKeyId: process.env.THUMBNAIL_S3_ACCESS_KEY,
              secretAccessKey: process.env.THUMBNAIL_S3_SECRET_KEY
          },
          region: 'us-east-1'
      }),
      params: {
          Bucket: 'videograph-ond',
          Key: s3StorageKey,
          Body: fs.createReadStream(thumbnail_file)
      },
      tags: [], // optional tags
      queueSize: 4, // optional concurrency configuration
      partSize: 1024 * 1024 * 50, // optional size of each part, in bytes, at least 5MB
      leavePartsOnError: false, // optional manually handle dropped parts
    }).done()
  } catch(e) {
    console.log(`Failed to upload ${thumbnail_file} to s3`, e)
  }
}
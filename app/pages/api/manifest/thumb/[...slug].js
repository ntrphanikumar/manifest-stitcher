import axios from 'axios';

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

const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'thumbnails');
const { exec } = require("child_process");


const TSH=s=>{for(var i=0,h=9;i<s.length;)h=Math.imul(h^s.charCodeAt(i++),9**9);return h^h>>>9}

exec(`mkdir ${dir}`)
setInterval(() => {
  const command = `find ${dir} -maxdepth 1 -mmin +5 -type f  -exec rm -fv {} \\;`
  console.log(new Date(),'Removing files older than 5 mins', command)
  exec(command, (error, stderr, stdout) => {
    console.log(error,stderr,stdout)
  })
}, 60000);

const action = async (req, res) => {
  try {
    const {manifestUrl, s3StorageKey, sec, thumborUrl} = getManifestUrl(req)
    console.log(manifestUrl, s3StorageKey, sec, thumborUrl)
    if(thumborUrl !== undefined) {
      return await axios.get(thumborUrl, {responseType: 'stream'}).then(async response => {
        const thumbnail_file = `${dir}/${TSH(s3StorageKey)}.jpg`
        console.log('Wiring to image', thumbnail_file)
        const ws = fs.createWriteStream(thumbnail_file)
        response.data.pipe(ws)
        response.data.on("finish", ws.end)
        ws.on("close", () => uploadToS3AndSendResponse(thumbnail_file,s3StorageKey, res))
      }).catch(function(e) {
        console.log('Got error', e)
        res.status(400).send('Bad request');
      })
    } else if(manifestUrl === undefined) {
      res.status(404).send('Not supported');
      return;
    }
    const {segmentUrl, seekSecs} = await getThumbnailSegmentWithSeekSecs(manifestUrl, sec)
    const thumbnail_file = `${dir}/${TSH(segmentUrl)}_${sec}.jpg`
    const command = `rm ${thumbnail_file} | ffmpeg -i ${segmentUrl} -ss ${seekSecs} -frames:v 1 ${thumbnail_file}`
    exec(command, (error, stderr, stdout) => {
      try {
        if (error)  throw error
        else if (stderr) throw stderr
        else uploadToS3AndSendResponse(thumbnail_file,s3StorageKey, res)
      } catch( error) {
        console.log(error)
        res.status(404).send('Not found');    
      }
    })
  } catch (error) {
    console.log(error)
    res.status(404).send('Not found');
  }
}

function uploadToS3AndSendResponse(thumbnail_file, s3StorageKey, res) {
  uploadToS3(thumbnail_file, s3StorageKey)
  res.setHeader('Content-Type', 'image/jpeg');
  const rs = fs.createReadStream(thumbnail_file)
  rs.pipe(res)
  rs.on("finish", res.end)
}

const { Upload } = require("@aws-sdk/lib-storage");
const { S3Client } = require("@aws-sdk/client-s3");
function uploadToS3(thumbnail_file, s3StorageKey) {
  try {
    new Upload({
      client: new S3Client({
          credentials: {
              accessKeyId: process.env.THUMBNAIL_S3_ACCESS_KEY,
              secretAccessKey: process.env.THUMBNAIL_S3_SECRET_KEY
          },
          region: process.env.THUMBNAIL_S3_REGION
      }),
      params: {
          Bucket: process.env.THUMBNAIL_S3_BUCKET,
          Key: s3StorageKey,
          Body: fs.createReadStream(thumbnail_file)
      },
      tags: [], // optional tags
      queueSize: 4, // optional concurrency configuration
      partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
      leavePartsOnError: false, // optional manually handle dropped parts
    }).done()
  } catch(e) {
    console.log(`Failed to upload ${thumbnail_file} to s3`, e)
  }
}

function getManifestUrl(req) {
  const { slug } = req.query
  if(slug[0] === process.env.THUMBNAIL_VOD_PREFIX) {
    return {
      manifestUrl: [process.env.THUMBNAIL_VOD_MANIFEST_HOST].concat(slug.slice(0, -3)).concat([process.env.THUMBNAIL_VOD_MASTER_MANIFEST]).join('/'),
      s3StorageKey: `thumb/${slug.join('/')}`,
      sec: parseInt(slug.slice(-1)[0].replace('.jpg', ''))
    }
  } else if(slug[1] === process.env.THUMBNAIL_VOD_PREFIX && slug[0].indexOf('x') > -1) {
    return {
      thumborUrl: `${process.env.THUMBOR_HOST}/unsafe/${slug[0]}/${process.env.THUMBNAIL_HOST}/manifest/thumb/${slug.slice(1).join('/')}`,
      s3StorageKey: `thumb/${slug.join('/')}`,
      sec: parseInt(slug.slice(-1)[0].replace('.jpg', ''))
    }
  } else {
    console.log(new Date(), 'Non vod thumbnail request', slug)
    return {}
  }
}

async function getThumbnailSegmentWithSeekSecs(manifestUrl, sec) {
  const manifest = await downloadManifest(manifestUrl)
  const firstChildManifest = manifest.variants.filter(v=>!v.isIFrameOnly).map(v => fullUri(manifestUrl, v.uri)).slice(-1)[0]
  const childManifest = await downloadManifest(firstChildManifest)
  for(var idx=0, elapsedDuration=0; idx<childManifest.segments.length;idx++) {
    if(elapsedDuration + childManifest.segments[idx].duration < sec) {
      elapsedDuration+=childManifest.segments[idx].duration
    } else if(elapsedDuration + childManifest.segments[idx].duration === sec) {
      return {segmentUrl: fullUri(firstChildManifest, childManifest.segments[idx].uri), seekSecs: childManifest.segments[idx].duration-1}
    } else {
      return {segmentUrl: fullUri(firstChildManifest, childManifest.segments[idx].uri), seekSecs: sec - elapsedDuration-1}
    }
  }
  throw "Sec more than duration"
}

function fullUri(parentUrl, uri) {
  const mUrl = new URL(parentUrl)
  const mPrefix = mUrl.origin + mUrl.pathname.replace(mUrl.pathname.split("/").slice(-1)[0], '')
  let fUrl = (uri.startsWith("/"))?mUrl:(uri.startsWith("http")?'':mPrefix)+uri
  return fUrl
}

const HLS = require('hls-parser');
async function downloadManifest(url) {
  console.log(url)
  return await axios.get(url).then(async response => {
      return HLS.parse(response.data)
  })
}
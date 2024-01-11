import axios from 'axios';

export const enableCors = fn => async (req, res) => {
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

export const TSH=s=>{for(var i=0,h=9;i<s.length;)h=Math.imul(h^s.charCodeAt(i++),9**9);return h^h>>>9}

export function uploadToS3AndSendResponse(thumbnail_file, s3StorageKey, res) {
  uploadToS3(thumbnail_file, s3StorageKey)
  res.setHeader('Content-Type', 'image/jpeg');
  const rs = fs.createReadStream(thumbnail_file)
  rs.pipe(res)
  rs.on("finish", res.end)
}

const { Upload } = require("@aws-sdk/lib-storage");
const { S3Client } = require("@aws-sdk/client-s3");
export function uploadToS3(thumbnail_file, s3StorageKey) {
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

export async function getThumbnailSegmentWithSeekSecs(manifestUrl, sec) {
  const manifest = await downloadManifest(manifestUrl)
  if(manifest === undefined) throw 'Failed to download manifest: '+ manifestUrl
  const firstChildManifest = manifest.variants.filter(v=>!v.isIFrameOnly).map(v => fullUri(manifestUrl, v.uri)).slice(-1)[0]
  const childManifest = await downloadManifest(firstChildManifest)
  if(childManifest === undefined) throw 'Failed to download manifest: '+ firstChildManifest
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
  }).catch(function(error) {
    console.log(new Date(), url, 'Failed with status' ,error.response.status, error.response.data)
  })
}
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
// const dir = path.join(__dirname, 'generated');
const dir = __dirname;
const { exec } = require("child_process");


const TSH=s=>{for(var i=0,h=9;i<s.length;)h=Math.imul(h^s.charCodeAt(i++),9**9);return h^h>>>9}

const action = async (req, res) => {
  try {
    const {manifestUrl, sec} = getManifestUrl(req)
    const {segmentUrl, seekSecs} = await getThumbnailSegmentWithSeekSecs(manifestUrl, sec)
    const thumbnail_file = `${dir}/${TSH(segmentUrl)}_${sec}.jpg`
    const command = `rm ${thumbnail_file} | ffmpeg -i ${segmentUrl} -ss ${seekSecs} -frames:v 1 ${thumbnail_file}`
    console.log(command)
    exec(command, (error, stderr, stdout) => {
      try {
        if (error)  throw error
        else if (stderr) throw stderr
        else {
          const s = fs.createReadStream(thumbnail_file);
          s.on('open', function () {
              res.setHeader('Content-Type', 'image/jpeg');
              s.pipe(res);
          });
          s.on('error', function(e) {
            console.log('Got error')
            res.status(404).send('Got error');    
          })
        }
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

function getManifestUrl(req) {
  const { slug } = req.query
  if(slug[0] === 'enc') {
    return {manifestUrl: ['https://videographond.akamaized.net'].concat(slug.slice(0, slug.length-3)).concat(['master.m3u8']).join('/'), sec: parseInt(slug.slice(-1)[0].replace('.jpg', ''))}
  }
  return {manifestUrl: 'https://videographond.akamaized.net/enc/80b46fbb-0e8a-4647-a9f4-9510840190bf/348fd6ca-d9fe-4c8a-8963-c779d73a7675/fst/44111/master.m3u8', sec: 4}
}

async function getThumbnailSegmentWithSeekSecs(manifestUrl, sec) {
  const manifest = await downloadManifest(manifestUrl)
  const firstChildManifest = manifest.variants.filter(v=>!v.isIFrameOnly).map(v => fullUri(manifestUrl, v.uri))[0]
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
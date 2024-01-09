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


const action = async (req, res) => {
  const { slug } = req.query
  const manifestUrl = 'https://videographond.akamaized.net/enc/80b46fbb-0e8a-4647-a9f4-9510840190bf/348fd6ca-d9fe-4c8a-8963-c779d73a7675/fst/44111/master.m3u8'
  const manifest = await downloadManifest(manifestUrl)
  const lowestResManifest = manifest.variants.filter(v=>!v.isIFrameOnly).map(v => fullUri(manifestUrl, v.uri))[0]
  const sec = 0
  const seekSec = 0
  const segment_url = fullUri(lowestResManifest, (await downloadManifest(lowestResManifest)).segments[0].uri)

  const command = `ffmpeg -i ${segment_url} -ss ${seekSec} -frames:v 1 ${sec}.jpg`
  console.log(command)
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });
  console.log('Command completed')

  // console.log(dir)
  const s = fs.createReadStream(`${dir}/${sec}.jpg`);
  s.on('open', function () {
      res.setHeader('Content-Type', 'image/jpeg');
      s.pipe(res);
  });
  s.on('error', function () {
      res.setHeader('Content-Type', 'text/plain');
      res.status(404).end('Not found');
  });
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
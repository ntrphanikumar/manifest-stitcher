import {enableCors, action} from '../thumbnail_utils'

const path = require('path');
const dir = path.join(__dirname, 'thumbnails');
const { exec } = require("child_process");

export default async function handler(req, res) {
  enableCors(action)(req, res, getManifestUrl, dir)
}

exec(`mkdir ${dir}`)
setInterval(() => {
  const command = `find ${dir} -maxdepth 1 -mmin +5 -type f  -exec rm -fv {} \\;`
  console.log(new Date(),'Removing files older than 5 mins', command)
  exec(command, (error, stderr, stdout) => {
    console.log(error,stderr,stdout)
  })
}, 60000);

function getManifestUrl(req) {
  const { slug } = req.query
  return {
    manifestUrl: `https://vglive.akamaized.net/${slug[0]}/${slug[1]}/playlist.m3u8`,
    s3StorageKey: `live-images/${slug.join('/')}`,
    sec: 0
  }
}
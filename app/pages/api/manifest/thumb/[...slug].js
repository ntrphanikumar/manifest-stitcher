import axios from 'axios';
import {getThumbnailSegmentWithSeekSecs, uploadToS3AndSendResponse, enableCors, TSH} from '../thumbnail_utils'

export default async function handler(req, res) {
  enableCors(action)(req, res)
}

const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'thumbnails');
const { exec } = require("child_process");

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
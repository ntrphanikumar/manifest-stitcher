import {enableCors, action} from '../thumbnail_utils'

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

export default async function handler(req, res) {
  enableCors(action)(req, res, getManifestUrl, dir)
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
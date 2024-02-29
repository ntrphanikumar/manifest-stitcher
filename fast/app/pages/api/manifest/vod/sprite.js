const fs = require('fs');
const {resolve} = require('path');
const nsg = require('node-sprite-generator');

const path = require('path');
const dir = path.join(__dirname, 'sprites');
const { exec } = require("child_process");

exec(`mkdir ${dir}`)

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
    generateSprite(req.body)
    res.status(200).send({})
}

function generateSprite(vod) {
    const {sourceUrl, videoId, s3key} = vod
    console.log(sourceUrl, videoId)
    exec(`mkdir ${dir}/${videoId}`)
    const command = `ffmpeg -i ${sourceUrl}  -r 1 -vf "scale=100:-1" -f image2 ${dir}/${videoId}/thumb-%03d.jpeg`
    console.log(command)
    exec(command, (error, stderr, stdout) => {
        try {
          if (error)  throw error
          else if (stderr) throw stderr
          else {
            nsg({
                compositor: 'jimp',
                layout: 'horizontal',
                src: [`${dir}/${videoId}/*.jpeg`],
                spritePath: `${dir}/${videoId}/sprite.png`,
                stylesheetPath: `${dir}/${videoId}/sprite.styl`
            }, async function (err) {
                if(err) {
                    console.log('Sprite generation failed', err)
                } else {
                    console.log('Generated sprite successfully.')
                    try {
                        await uploadToS3(`${dir}/${videoId}/sprite.png`, s3key)
                    } finally {
                        exec(`rm -rf ${dir}/${videoId}`)
                    }
                }
            });
          }
        } catch( error) {
          console.log(error)
        }
    })
}

const { Upload } = require("@aws-sdk/lib-storage");
const { S3Client } = require("@aws-sdk/client-s3");
async function uploadToS3(thumbnail_file, s3StorageKey) {
    console.log(thumbnail_file, s3StorageKey)
  try {
    return new Upload({
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
      partSize: 1024 * 1024 * 50, // optional size of each part, in bytes, at least 5MB
      leavePartsOnError: false, // optional manually handle dropped parts
    }).done()
  } catch(e) {
    console.log(`Failed to upload ${thumbnail_file} to s3`, e)
  }
}
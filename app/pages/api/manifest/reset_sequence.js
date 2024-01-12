import axios from 'axios';

import {channelResult, channelManifests} from "./verify_sequence"
import {errorContents} from "./consolidate_seq"

const fs = require('fs');
const dir = __dirname

export default async (req, res) => {
  const {playbackUrl} = req.body
  if(playbackUrl !== undefined) {
    const result = await resetSequence(playbackUrl)
    res.status(200).json(result)
  } else {
    const ec = errorContents()
    res.status(400).json({message: 'Not supported now.'})
  }

    // const ec = errorContents()
    // console.log(ec)

    // const result  = await Promise.all(ec.map(async channel => await Promise.all(channel.result.map(async epgUrl => await channelManifests(channel.channel, 0,0, epgUrl)))))
    // res.status(200).send(result.flat(1).flat(1).map(url => new URL(url).pathname.substring(1)).join('\n'));

    // ec.forEach(async (channel) => {
    //         console.log('Running for channel', channel.channel);
    //         await channel.result.forEach(async (epgUrl) => {
    //             const epgCR = await channelResult(channel.channel, 0, 0, epgUrl);
    //             epgCR.forEach(anomaly => {
    //                 const items = anomaly.seq.map(seq => anomaly[seq + ''].forEach(function (r) {
    //                     r.seq = seq;
    //                     r.source = r.source.replace(`#EXT-X-MEDIA-SEQUENCE:${r.seq}`, `#EXT-X-MEDIA-SEQUENCE:1`);
    //                 }));
    //                 const res = anomaly.seq.map(seq => anomaly[seq + '']).flat(1);
    //                 res.forEach(uploadToS3);
    //             });
    //             console.log('Completed for epg url', epgUrl);
    //             return epgCR;
    //         });

    //         // console.log(channel, 'All CRS', allCrs)
    //         // console.log(channel.channel, 'All CRS', allCrs)
    //         // await channel.result.forEach(async (epgUrl) => {
    //         //     console.log('Running for epg url', epgUrl);
    //         //     const result = await channelResult(channel.channel, 0, 0, epgUrl);
    //         //     result.forEach(anomaly => {
    //         //         const items = anomaly.seq.map(seq => anomaly[seq + ''].forEach(function (r) {
    //         //             r.seq = seq;
    //         //             r.source = r.source.replace(`#EXT-X-MEDIA-SEQUENCE:${r.seq}`, `#EXT-X-MEDIA-SEQUENCE:1`);
    //         //         }));
    //         //         const res = anomaly.seq.map(seq => anomaly[seq + '']).flat(1);
    //         //         res.forEach(uploadToS3);
    //         //     });
    //         //     console.log('Completed for epg url', epgUrl);
    //         // });
    // })  
    // res.status(200).json(ec);
};

async function resetSequence(playbackUrl) {
  const epgResult = await channelResult('', 0, 0, playbackUrl)
  const s3Keys = epgResult.map(anomaly => {
    const items = anomaly.seq.map(seq => anomaly[seq + ''].forEach(function (r) {
        r.seq = seq;
        r.source = r.source.replace(`#EXT-X-MEDIA-SEQUENCE:${r.seq}`, `#EXT-X-MEDIA-SEQUENCE:1`);
    }));
    const res = anomaly.seq.map(seq => anomaly[seq + '']).flat(1);
    return res.map(uploadToS3);
  }).flat(1);
  if(s3Keys.length > 0){
    invalidateCloudFrontKeys(s3Keys)
  }
  const message = s3Keys.length > 0 ? ('Reset media sequence done for url: '+playbackUrl): ('No media sequence issue observed for url: '+ playbackUrl)
  process.env.RESET_SEQ_NOTIFICATION_WEBHOOK && axios.post(process.env.RESET_SEQ_NOTIFICATION_WEBHOOK, JSON.stringify({text: message}), {headers: {'Content-Type': 'application/json'}})
        .catch(error => {console.log(error.message, message)})
  return {message: "Reset complete", s3Keys: s3Keys}
}

import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
async function invalidateCloudFrontKeys(keys) {
  const client = new CloudFrontClient({
    credentials: {
        accessKeyId: process.env.RESET_SEQ_S3_ACCESS_KEY,
        secretAccessKey: process.env.RESET_SEQ_S3_SECRET_KEY
    },
    region: process.env.RESET_SEQ_S3_REGION
});
const pathsToInvalidate = keys.map(k => '/'+k)
  const input = { // CreateInvalidationRequest
  DistributionId: process.env.RESET_SEQ_CF_DISTRIBUTION,
  InvalidationBatch: { // InvalidationBatch
    Paths: { // Paths
      Quantity: keys.length, // required
      Items: pathsToInvalidate,
    },
    CallerReference: new Date().getTime().toString() // required
  },
};
  const command = new CreateInvalidationCommand(input);
  const response = await client.send(command);
  console.log(response)
}



const { Upload } = require("@aws-sdk/lib-storage");
const { S3Client, S3 } = require("@aws-sdk/client-s3");
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.RESET_SEQ_S3_ACCESS_KEY,
        secretAccessKey: process.env.RESET_SEQ_S3_SECRET_KEY
    },
    region: process.env.RESET_SEQ_S3_REGION
})

function uploadToS3(item) {
  try {
    const key = new URL(item.fullUri).pathname.substring(1)
    console.log('Uploading to', key)
    new Upload({
      client: s3Client,
      params: {
          Bucket: process.env.RESET_SEQ_S3_BUCKET,
          Key: key,
          Body: item.source
      },
      tags: [], // optional tags
      queueSize: 4, // optional concurrency configuration
      partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
      leavePartsOnError: false, // optional manually handle dropped parts
    }).done()
    return key
  } catch(e) {
    console.log(`Failed to upload ${thumbnail_file} to s3`, e)
  }
}

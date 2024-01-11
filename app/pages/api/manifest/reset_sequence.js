import axios from 'axios';

import {channelResult, channelManifests} from "./verify_sequence"
import {errorContents} from "./consolidate_seq"

const fs = require('fs');
const dir = __dirname

export default async (req, res) => {

    const ec = errorContents()
    // console.log(ec)

    const result  = await Promise.all(ec.map(async channel => await Promise.all(channel.result.map(async epgUrl => await channelManifests(channel.channel, 0,0, epgUrl)))))
    res.status(200).send(result.flat(1).flat(1).map(url => new URL(url).pathname.substring(1)).join('\n'));

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
  } catch(e) {
    console.log(`Failed to upload ${thumbnail_file} to s3`, e)
  }
}
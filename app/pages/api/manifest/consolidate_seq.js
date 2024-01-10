import axios from 'axios';

import {channelResult} from "./verify_sequence"

const fs = require('fs');
const dir = __dirname

export default async (req, res) => {
    res.status(200).json(errorContents());
};

export function errorContents() {
  const dirPath = '/Users/ntrphanikumar/workspace/personal/manifest-stitcher/app/seq_errors'
    const files = fs.readdirSync(dirPath, function(err, files) {
      return files
    })
    return files.map(file => {
      return {
        channel: file.replace('.json',''),
        result: JSON.parse(fs.readFileSync(`${dirPath}/${file}`, 'utf8')).map(r => r.url)
      }
    }).filter(e => e.result.length > 0)
}

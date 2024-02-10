import axios from 'axios';

const HLS = require('hls-parser');


const fs = require('fs');
const path = require('path');
// const dir = path.join(__dirname, 'generated');
const dir = __dirname

export default async (req, res) => {
    const { channel} = req.query

    const s = fs.createReadStream(`${dir}/${channel}.json`);
  s.on('open', function () {
      res.setHeader('Content-Type', 'application/json');
      s.pipe(res);
  });
  s.on('error', function () {
    res.status(404).json({reason: 'Error'});
  });

};
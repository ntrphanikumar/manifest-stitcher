import {channelPlaylist, fetchPlaylist} from "./download"

const MainManifest = '#EXTM3U\n#EXT-X-VERSION:4\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-STREAM-INF:BANDWIDTH=1561904,AVERAGE-BANDWIDTH=1161845,FRAME-RATE=25.000,CODECS="avc1.64001E,mp4a.40.2",RESOLUTION=640x360\nbitrate0.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3738192,AVERAGE-BANDWIDTH=2719428,FRAME-RATE=25.000,CODECS="avc1.64001F,mp4a.40.2",RESOLUTION=1280x720\nbitrate1.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5162480,AVERAGE-BANDWIDTH=3733809,FRAME-RATE=25.000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1920x1080\nbitrate2.m3u8'


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
  const { slug } = req.query
  const channel = slug[0]
  const file = slug[1]

  if(file === 'main.m3u8') res.send(MainManifest)
  else if(file === 'bitrate0.m3u8') res.send(await childManifest(channel, '640'))
  else if(file === 'bitrate1.m3u8') res.send(await childManifest(channel, '1280'))
  else if(file === 'bitrate2.m3u8') res.send(await childManifest(channel, '1920'))
  else res.status(404).send('Not found')
}

async function childManifest(channel, width) {
  let playlist = channelPlaylist[channel]
  const current = new Date().getTime()
  // console.log(new Date(current), channel, width, new Date(playlist?.endtime))
  if(playlist == undefined  || playlist.endtime < current+60000) {
    console.log(new Date(), channel, width,'Fetching playlist in realtime')
    playlist = await fetchPlaylist(channel)
  } else if(playlist.endtime < current+120000) {
    console.log(new Date(), channel, width,'Fetching playlist in backgroung')
    fetchPlaylist(channel)
  }
  // const cts = playlist.contents[width].filter(r => r.endtime >= current)
  return manifest(playlist.contents[width])
}

function manifest(contents) {
  const currenttime = new Date().getTime()
  const heading = '#EXTM3U\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10,\n#EXT-X-MEDIA-SEQUENCE:'+currenttime
  const response = heading + contents.filter(c => c.endtime < currenttime+parseInt(process.env.MANIFEST_DURATION_IN_SECS) && c.endtime >= currenttime).map(c => c.uri==='CONTENT_END'?'\n#EXT-X-DISCONTINUITY':'\n#EXTINF:'+parseInt(c.duration/1000)+',\n'+c.uri).join('')+'\n'
  // console.log(response)
  return response
}

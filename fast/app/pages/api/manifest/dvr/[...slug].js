
const ManifestPrefix = '#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:5\n#EXT-X-INDEPENDENT-SEGMENTS'
const ManifestSuffix = '#EXT-X-ENDLIST'

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

const {  DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const client = new DynamoDBClient({
  credentials: {
      accessKeyId: process.env.THUMBNAIL_S3_ACCESS_KEY,
      secretAccessKey: process.env.THUMBNAIL_S3_SECRET_KEY
  },
  region: 'ap-south-1'
});

const action = async (req, res) => {
  try {
    const { slug } = req.query
    const channelId = slug[0]
    const startEpoc = parseInt(slug[1])
    const duration = parseInt(slug[2])

    var params = {
      ExpressionAttributeValues: {
        ":s": { S: channelId },
        ":se": { N: ""+(startEpoc-4) },
        ":ee": { N: ""+(startEpoc+duration+4) }
      },
      KeyConditionExpression: "stream_id = :s and start_epoch > :se",
      FilterExpression: "end_epoch < :ee",
      TableName: "dvr_segments",
    };
    const command = new QueryCommand(params);
    const response = await client.send(command);
    const elements = response.Items.map(e => '#EXTINF:'+e.duration.N+',\n'+process.env.DVR_HOST+'/'+e.storage_path.S);

    res.status(200).send([ManifestPrefix].concat(elements).concat([ManifestSuffix]).join('\n'))
  } catch (error) {
    console.log(error)
    res.status(500).send(error)
  }
}

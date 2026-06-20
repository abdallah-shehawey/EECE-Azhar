// Serverless function: upload a photo to Cloudflare R2.
// CommonJS — the project's package.json has no "type": "module",
// and the existing node scripts (sort_students.js, scripts/migrate.js) are CJS too.
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Cache the S3 client across warm invocations
let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing Cloudflare R2 credentials in environment variables');
  }

  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return s3Client;
}

const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // DELETE — remove a now-unused object (e.g. the old photo after a replacement
  // is uploaded), so stale images don't pile up in the bucket.
  if (req.method === 'DELETE') {
    try {
      const key = (req.body && req.body.filename) || (req.query && req.query.filename);
      if (!key) return res.status(400).json({ error: 'Missing filename' });
      const bucketName = process.env.R2_BUCKET_NAME || 'eece-azhar-images';
      await getS3Client().send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
      return res.status(200).json({ success: true, deleted: key });
    } catch (error) {
      console.error('R2 delete error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileBase64, filename, mimeType } = req.body;

    if (!fileBase64 || !filename) {
      return res.status(400).json({ error: 'Missing fileBase64 or filename' });
    }

    const bucketName = process.env.R2_BUCKET_NAME || 'eece-azhar-images';
    const s3 = getS3Client();

    const buffer = Buffer.from(fileBase64, 'base64');

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filename,
      Body: buffer,
      ContentType: mimeType || 'image/webp',
    });

    await s3.send(command);

    res.status(200).json({
      success: true,
      fileId: filename,
      fileName: filename,
    });
  } catch (error) {
    console.error('R2 upload error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = handler;
module.exports.config = config;

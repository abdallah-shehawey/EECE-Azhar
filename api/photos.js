import { google } from 'googleapis';

// Cache in memory for the lifetime of this serverless function instance
let cachedPhotos = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  try {
    // Return cache if still valid
    if (cachedPhotos && Date.now() - cacheTime < CACHE_TTL) {
      return res.status(200).json({ success: true, photos: cachedPhotos });
    }

    // ✅ Decode base64-encoded JSON credentials
    // This is the most reliable way to store service account JSON in Vercel
    const credentialsJson = Buffer.from(
      process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,
      'base64'
    ).toString('utf-8');
    const credentials = JSON.parse(credentialsJson);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 500,
    });

    // Build a map: { "abdallah": "https://drive.google.com/thumbnail?..." }
    const photos = {};
    for (const file of response.data.files) {
      const key = file.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
      photos[key] = `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
    }

    cachedPhotos = photos;
    cacheTime = Date.now();

    res.status(200).json({ success: true, photos });
  } catch (error) {
    console.error('Drive API Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

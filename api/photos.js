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

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 500,
    });

    // Build a map: { "abdallah": "https://lh3.googleusercontent.com/..." }
    const photos = {};
    for (const file of response.data.files) {
      // Remove extension and convert to lowercase key
      // e.g. "Abdallah.jpg" → key: "abdallah"
      const key = file.name.replace(/\.[^/.]+$/, '').toLowerCase().trim();
      // Use thumbnail link scaled up — fastest to load, no auth needed
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

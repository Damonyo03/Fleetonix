const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccount = require('../appfleetonix-firebase-adminsdk-fbsvc-b6aecf2c1e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'appfleetonix.firebasestorage.app'
});

const bucket = admin.storage().bucket();
const localFile = 'C:\\Users\\user\\Downloads\\Projects\\Fleetonix\\Fleetonix_Android_App\\Fleetonix\\app\\build\\outputs\\apk\\debug\\app-debug.apk';
const remoteFile = 'downloads/Fleetonix_Driver.apk';

async function uploadFile() {
  console.log(`Checking local file: ${localFile}`);
  if (!fs.existsSync(localFile)) {
    console.error('Local file does not exist!');
    process.exit(1);
  }

  console.log(`Uploading ${localFile} to ${remoteFile}...`);
  try {
    await bucket.upload(localFile, {
      destination: remoteFile,
      metadata: {
        contentType: 'application/vnd.android.package-archive',
        cacheControl: 'public, max-age=3600',
      },
    });
    console.log('Upload successful!');
  } catch (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
}

uploadFile();

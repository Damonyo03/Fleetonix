// Firebase Configuration for Fleetonix
export const firebaseConfig = {
  apiKey: "AIzaSyBWal4kXhImWNvJL2jV4LG0FvftdN2J9DQ",
  authDomain: "appfleetonix.firebaseapp.com",
  projectId: "appfleetonix",
  storageBucket: "appfleetonix.firebasestorage.app",
  messagingSenderId: "1036612951739",
  appId: "1:1036612951739:web:ca2c08d483baa564b3539e",
  measurementId: "G-WN03YG2XLC"
};

/**
 * Flag to indicate if we should use emulators.
 * Currently disabled by default to avoid connection errors if emulators are not running.
 * Enable by adding ?emulators=true to your URL or manually setting to true.
 */
const urlParams = new URLSearchParams(window.location.search);
export const useEmulators = urlParams.has('emulators');

if (useEmulators) {
    console.warn("Firebase Emulators enabled via URL parameter.");
}

/**
 * Default emulator ports (matching Firebase defaults)
 */
export const emulatorConfig = {
    auth: "http://localhost:9099",
    firestore: { host: "localhost", port: 8080 }
};

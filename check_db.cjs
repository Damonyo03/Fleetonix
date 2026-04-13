const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBWal4kXhImWNvJL2jV4LG0FvftdN2J9DQ",
  authDomain: "appfleetonix.firebaseapp.com",
  projectId: "appfleetonix",
  storageBucket: "appfleetonix.firebasestorage.app",
  messagingSenderId: "1036612951739",
  appId: "1:1036612951739:web:ca2c08d483baa564b3539e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkSchedules() {
  const scheds = await getDocs(collection(db, 'schedules'));
  console.log("Total schedules:", scheds.size);
  scheds.forEach(doc => {
    console.log("ID:", doc.id, "Data:", JSON.stringify(doc.data(), null, 2));
  });
  
  const drivers = await getDocs(collection(db, 'drivers'));
  console.log("\nTotal drivers:", drivers.size);
  drivers.forEach(doc => {
    console.log("ID:", doc.id, "Data:", JSON.stringify(doc.data(), null, 2));
  });
  
  process.exit(0);
}

checkSchedules().catch(console.error);
